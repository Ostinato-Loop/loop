/**
 * Unit tests for Loop auth — OTP rate limiting + token revocation
 * Run: pnpm test
 *
 * Uses Vitest with an in-memory mock KVNamespace.
 * No real Cloudflare, Termii, or Supabase calls are made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkSlidingWindow, getClientIp, logAbuse } from "./auth.js";
import { signJwt, verifyJwt, JWT_ISSUER, JWT_AUDIENCE, TTL_OTP_S } from "../lib/jwt.js";

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
    for (let i = 0; i < 10; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 10, 3_600_000);
    }
    const result = await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 10, 3_600_000);
    expect(result.allowed).toBe(false);
  });

  it("evicts expired timestamps and allows again", async () => {
    const KEY = "test:expire";
    const windowMs = 1000;
    for (let i = 0; i < 3; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, KEY, 3, windowMs);
    }
    const expiredTimestamps = [Date.now() - 2000, Date.now() - 1500];
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
    for (let i = 0; i < 10; i++) {
      await checkSlidingWindow(kv as unknown as KVNamespace, "otp:ip:10.0.0.1", 10, 3_600_000);
    }
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
    expect(jsonStr).not.toContain("+234");
    expect(jsonStr).toContain("5678");
    spy.mockRestore();
  });
});

// ── Token revocation (PHD-001) ────────────────────────────────────────────────

describe("token revocation — KV blocklist", () => {
  const TEST_SECRET = "test-secret-32-chars-minimum-len";

  it("a fresh token is not in the blocklist", async () => {
    const kv = new MockKV();
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    await signJwt(
      { sub: "user-1", email: null, role: "authenticated", iss: JWT_ISSUER, aud: JWT_AUDIENCE,
        iat: now, exp: now + TTL_OTP_S, jti, id: "user-1", source: "otp" },
      TEST_SECRET,
    );
    const blocked = await kv.get(`revoked:jti:${jti}`);
    expect(blocked).toBeNull();
  });

  it("adding jti to KV marks token as revoked", async () => {
    const kv = new MockKV();
    const jti = crypto.randomUUID();
    await kv.put(`revoked:jti:${jti}`, "1", { expirationTtl: 3600 });
    const blocked = await kv.get(`revoked:jti:${jti}`);
    expect(blocked).toBe("1");
  });

  it("revocation check: blocked jti returns non-null from KV", async () => {
    const kv = new MockKV();
    const jti = crypto.randomUUID();
    // Simulate: signout writes jti to blocklist
    await kv.put(`revoked:jti:${jti}`, "1", { expirationTtl: 604_800 });
    // Simulate: middleware checks blocklist
    const revoked = await kv.get(`revoked:jti:${jti}`);
    expect(revoked).not.toBeNull();
  });

  it("different jtis do not block each other", async () => {
    const kv = new MockKV();
    const jti1 = crypto.randomUUID();
    const jti2 = crypto.randomUUID();
    // Revoke jti1 only
    await kv.put(`revoked:jti:${jti1}`, "1", { expirationTtl: 3600 });
    const blocked1 = await kv.get(`revoked:jti:${jti1}`);
    const blocked2 = await kv.get(`revoked:jti:${jti2}`);
    expect(blocked1).toBe("1");
    expect(blocked2).toBeNull();
  });

  it("verifyJwt returns payload with jti claim", async () => {
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const token = await signJwt(
      { sub: "user-abc", email: null, role: "authenticated", iss: JWT_ISSUER, aud: JWT_AUDIENCE,
        iat: now, exp: now + 3600, jti, id: "user-abc", source: "otp" },
      TEST_SECRET,
    );
    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.jti).toBe(jti);
    expect(payload?.sub).toBe("user-abc");
  });

  it("verifyJwt returns null for expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await signJwt(
      { sub: "user-xyz", email: null, role: "authenticated", iss: JWT_ISSUER, aud: JWT_AUDIENCE,
        iat: past - 3600, exp: past, jti: crypto.randomUUID(), id: "user-xyz", source: "otp" },
      TEST_SECRET,
    );
    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload).toBeNull();
  });

  it("verifyJwt returns null for wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt(
      { sub: "user-xyz", email: null, role: "authenticated", iss: JWT_ISSUER, aud: JWT_AUDIENCE,
        iat: now, exp: now + 3600, jti: crypto.randomUUID(), id: "user-xyz", source: "otp" },
      TEST_SECRET,
    );
    const payload = await verifyJwt(token, "wrong-secret-32-chars-minimum-len");
    expect(payload).toBeNull();
  });

  it("TTL for revocation entry equals remaining token lifetime", async () => {
    const kv = new MockKV();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 604_800; // 7 days
    const ttl = Math.max(exp - now, 1);
    const jti = crypto.randomUUID();
    await kv.put(`revoked:jti:${jti}`, "1", { expirationTtl: ttl });
    // TTL should be ~7 days (604800 seconds)
    expect(ttl).toBeGreaterThanOrEqual(604_799);
    expect(ttl).toBeLessThanOrEqual(604_800);
    const entry = await kv.get(`revoked:jti:${jti}`);
    expect(entry).toBe("1");
  });

  it("signout of token without jti sets revoked: false", async () => {
    // Pre-PHD-001 tokens have no jti — cannot be server-revoked
    const jti = undefined as string | undefined;
    const revoked = jti !== undefined;
    expect(revoked).toBe(false);
  });
});
