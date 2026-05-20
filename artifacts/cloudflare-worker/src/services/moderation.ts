import type { CloudflareEnv } from "../types/env.js";

/**
 * Content moderation service.
 *
 * Keeps Loop rooms safe without blocking the real-time experience.
 * Moderation runs async (via Queue) so it never adds latency to
 * the host's send path.
 *
 * Layers:
 *  1. Workers AI text classification (@cf/huggingface/distilbert-sst-2-int8)
 *  2. Keyword blocklist stored in KV
 *  3. Escalation to human moderator queue (future)
 */

export type ModerationVerdict = "ok" | "warn" | "block";

export interface ModerationResult {
  verdict: ModerationVerdict;
  score: number;     // 0–1, higher = more likely harmful
  reason?: string;
  provider: "workers-ai" | "blocklist" | "passthrough";
}

/**
 * Moderate a chat message before storage.
 * Called synchronously on the message send path — must be fast.
 * Falls through to "ok" until Workers AI is wired.
 */
export async function moderateMessage(
  env: CloudflareEnv,
  text: string,
  lang = "en",
): Promise<ModerationResult> {
  // ── Blocklist check (KV, fast path) ──────────────────────────────
  const blocklist = await env.CACHE.get("moderation:blocklist", "json") as string[] | null;
  if (blocklist) {
    const lower = text.toLowerCase();
    if (blocklist.some((word) => lower.includes(word))) {
      return { verdict: "block", score: 1, reason: "blocklist", provider: "blocklist" };
    }
  }

  // ── TODO: Workers AI classification ──────────────────────────────
  // const result = await env.AI.run("@cf/huggingface/distilbert-sst-2-int8", {
  //   text,
  // });
  // const score = result.label === "NEGATIVE" ? result.score : 0;
  // if (score > 0.9) return { verdict: "block", score, provider: "workers-ai" };
  // if (score > 0.7) return { verdict: "warn",  score, provider: "workers-ai" };

  return { verdict: "ok", score: 0, provider: "passthrough" };
}
