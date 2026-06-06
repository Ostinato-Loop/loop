/**
 * Unit tests for Loop OTP rate limiting — auth.ts
 * Run: pnpm test
 *
 * Uses Vitest with an in-memory mock KVNamespace.
 * No real Cloudflare or Termii calls are made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkSlidingWindow, getClientIp, logAbuse } from "./auth.js";

// ── Mock KVNamespace ──────────────────────────────────────────────────────────

class MockKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ── checkSlidingWindow ────────────────────────────────────────────────────────

describe("checkSlidingWindow", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = new MockKV();
  });

  it("allows the first request", async () => {
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, "test:key", 5, 3_600_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("counts up to the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkSlidingWindow(kv as unknown as KVNamespace, "test:phone", 5, 3_600_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSlidingWindow(kv as unknown as KVNamespace, "test:phone", 5, 3_600_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("blocks after limit is reached", async () => {
    const KEY = "test:block";
    // Fill up the limit
    for (let i = 0; i < 10; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 10, 3_600_000);
    }
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 10, 3_600_000);
    expect(result.allowed).toBe(false);
  });

  it("evicts expired timestamps and allows again", async () => {
    const KEY = "test:expire";
    const windowMs = 1000; // 1 second window for test

    // Fill the limit
    for (let i = 0; i < 3; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 3, windowMs);
    }

    // Manually write expired timestamps to KV
    const expiredTimestamps = [Date.now() - 2000, Date.now() - 1500]; // both outside 1s window
    await kv.put(KEY, JSON.stringify(expiredTimestamps));

    const result = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 3, windowMs);
    expect(result.allowed).toBe(true);
  });

  it("returns correct remaining count", async () => {
    const KEY = "test:remaining";
    const r1 = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 5, 3_600_000);
    expect(r1.remaining).toBe(4);
    const r2 = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 5, 3_600_000);
    expect(r2.remaining).toBe(3);
    const r3 = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 5, 3_600_000);
    expect(r3.remaining).toBe(2);
  });

  it("returns resetAtSec in the future", async () => {
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, "test:reset", 5, 3_600_000);
    expect(result.resetAtSec).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("handles corrupt KV data gracefully", async () => {
    await kv.put("test:corrupt", "not-valid-json{{{{");
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, "test:corrupt", 5, 3_600_000);
    // Should treat as empty — allow and not throw
    expect(result.allowed).toBe(true);
  });

  it("handles empty KV (cold start)", async () => {
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, "test:cold", 5, 3_600_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("IP limit: 10 per hour — blocks on 11th", async () => {
    const IP_KEY = "otp:ip:1.2.3.4";
    for (let i = 0; i < 10; i++) {
      const r = await checkSlidingWindow(kv as unknown as KVNamespace, IP_KEY, 10, 3_600_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSlidingWindow(kv as unknown as KVNamespace, IP_KEY, 10, 3_600_000);
    expect(blocked.allowed).toBe(false);
  });

  it("phone limit: 5 per hour — blocks on 6th", async () => {
    const PHONE_KEY = "otp:phone:+2348000001234";
    for (let i = 0; i < 5; i++) {
      const r = await checkSlidingWindow(kv as unknown as KVNamespace, PHONE_KEY, 5, 3_600_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSlidingWindow(kv as unknown as KVNamespace, PHONE_KEY, 5, 3_600_000);
    expect(blocked.allowed).toBe(false);
  });

  it("verify IP limit: 20 per hour — blocks on 21st", async () => {
    const KEY = "otp:verify:ip:5.6.7.8";
    for (let i = 0; i < 20; i++) {
      const r = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 20, 3_600_000);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 20, 3_600_000);
    expect(blocked.allowed).toBe(false);
  });

  it("different IPs do not share rate limit state", async () => {
    // Fill IP1 to limit
    for (let i = 0; i < 10; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, "otp:ip:10.0.0.1", 10, 3_600_000);
    }
    // IP2 should still be allowed
    const ip2 = await checkSlidingWindow(kv as unknown as KVNamespace, "otp:ip:10.0.0.2", 10, 3_600_000);
    expect(ip2.allowed).toBe(true);
  });

  it("different phones do not share rate limit state", async () => {
    for (let i = 0; i < 5; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, "otp:phone:+2341111111111", 5, 3_600_000);
    }
    const other = await checkSlidingWindow(kv as unknown as KVNamespace, "otp:phone:+2342222222222", 5, 3_600_000);
    expect(other.allowed).toBe(true);
  });
});

// ── getClientIp ───────────────────────────────────────────────────────────────

describe("getClientIp", () => {
  it("extracts CF-Connecting-IP (highest priority)", () => {
    const req = new Request("https://loop-api.rald.cloud/api/auth/send-otp", {
      headers: { "CF-Connecting-IP": "1.2.3.4", "X-Forwarded-For": "5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to X-Forwarded-For when CF-Connecting-IP absent", () => {
    const req = new Request("https://loop-api.rald.cloud/api/auth/send-otp", {
      headers: { "X-Forwarded-For": "9.10.11.12, 13.14.15.16" },
    });
    expect(getClientIp(req)).toBe("9.10.11.12");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = new Request("https://loop-api.rald.cloud/api/auth/send-otp");
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from X-Forwarded-For", () => {
    const req = new Request("https://loop-api.rald.cloud/api/auth/send-otp", {
      headers: { "X-Forwarded-For": "  192.168.1.1  , 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });
});

// ── logAbuse ──────────────────────────────────────────────────────────────────

describe("logAbuse", () => {
  it("logs structured JSON to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAbuse({
      type: "otp_send_ip_blocked",
      ip: "1.2.3.4",
      phoneSuffix: "1234",
      remaining: 0,
      resetAtSec: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(spy).toHaveBeenCalledOnce();
    const [prefix, jsonStr] = spy.mock.calls[0] as [string, string];
    expect(prefix).toBe("[LOOP/ABUSE]");
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    expect(parsed.type).toBe("otp_send_ip_blocked");
    expect(parsed.ip).toBe("1.2.3.4");
    expect(parsed.phoneSuffix).toBe("1234");
    expect(parsed.service).toBe("loop-api");
    expect(parsed.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it("never logs full phone number — only suffix", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logAbuse({
      type: "otp_send_phone_blocked",
      ip: "5.6.7.8",
      phoneSuffix: "5678",
      remaining: 0,
      resetAtSec: Math.floor(Date.now() / 1000) + 3600,
    });
    const [, jsonStr] = spy.mock.calls[0] as [string, string];
    // Full phone should never appear — only the suffix
    expect(jsonStr).not.toContain("+234");
    expect(jsonStr).toContain("5678");
    spy.mockRestore();
  });
});
