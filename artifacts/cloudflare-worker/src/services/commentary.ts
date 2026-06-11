/**
 * AI commentary service — generates live contextual commentary
 * for sports events, civic moments, and music rooms.
 *
 * Powered by Workers AI (via AI binding) and/or OpenRouter
 * for access to frontier models (llama-3, claude, gemini).
 *
 * Design principles:
 *  - Always stream from Workers AI for low latency on CF edge
 *  - Fall back to OpenRouter for complex multilingual tasks
 *  - Cache generated summaries in KV; enqueue heavy jobs to Queue
 *
 * REPLAY-001 (2026-06-11): After summary generation:
 *   1. Persist ai_summary to rooms table (fast path for GET /summary)
 *   2. Notify all room_participants via OneSignal push + in-app notification insert
 */

import type { CloudflareEnv } from "../types/env.js";
import { sendOneSignalNotification } from "../lib/push-crypto.js";

export interface CommentaryRequest {
  roomId: string;
  context: string;   // current room topic / transcript excerpt
  lang: string;      // target output language
  style: "formal" | "casual" | "hype";
}

export interface CommentaryResult {
  text: string;
  lang: string;
  model: string;
  cached: boolean;
}

/**
 * Generate real-time commentary for a live room.
 * Uses Workers AI for sub-50ms latency at the edge.
 */
export async function generateCommentary(
  env: CloudflareEnv,
  req: CommentaryRequest,
): Promise<CommentaryResult> {
  // TODO: implement Workers AI call
  // const stream = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
  //   prompt: buildPrompt(req),
  //   stream: false,
  // });

  return {
    text: `[Commentary placeholder for room ${req.roomId}]`,
    lang: req.lang,
    model: "placeholder",
    cached: false,
  };
}

/**
 * Generate a post-room AI summary, persist it, and notify all participants.
 *
 * Steps:
 *   1. Generate summary text (Workers AI TODO — meaningful placeholder for now)
 *   2. Cache in KV: summary:{roomId}  (24 h TTL)
 *   3. Persist ai_summary column on the rooms row in Supabase
 *   4. Fetch room title + all room_participants
 *   5. OneSignal push to every participant device ("Replay ready")
 *   6. Insert notification row per participant (in-app inbox)
 *
 * Called from the Queue consumer (index.ts) after a room ends.
 * Steps 3-6 are fire-and-forget — they never block the Queue ack.
 */
export async function generateRoomSummary(
  env: CloudflareEnv,
  roomId: string,
  transcript: string,
): Promise<string> {
  const cacheKey = `summary:${roomId}`;

  // ── 1. Generate summary text ──────────────────────────────────────────────
  // TODO: replace with real Workers AI call once AI binding is confirmed in wrangler.toml:
  // const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
  //   messages: [
  //     { role: "system", content: "Summarise this room transcript in 2 sentences." },
  //     { role: "user",   content: transcript },
  //   ],
  // });
  // const summary = typeof result.response === "string" ? result.response : `Replay ready for room ${roomId}.`;
  void transcript; // will be consumed by the AI call above when wired
  const summary = `The replay for this room is ready. Tap to read a summary of what was discussed.`;

  // ── 2. Cache in KV ────────────────────────────────────────────────────────
  await env.CACHE.put(cacheKey, summary, { expirationTtl: 86400 });

  // ── 3-6. Persist to DB + notify participants (fire-and-forget) ────────────
  notifyAndPersist(env, roomId, summary).catch((err) =>
    console.error(JSON.stringify({
      level: "error", event: "replay_notify_failed",
      roomId, error: String(err),
      service: "loop-api", timestamp: new Date().toISOString(),
    }))
  );

  return summary;
}

// ── Internal helper: DB persist + dual-delivery notification ─────────────────

async function notifyAndPersist(
  env: CloudflareEnv,
  roomId: string,
  summary: string,
): Promise<void> {
  const sbUrl     = env.SUPABASE_URL;
  const sbKey     = env.SUPABASE_SERVICE_ROLE_KEY;
  const sbHeaders = {
    apikey:         sbKey,
    Authorization:  `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Accept:         "application/json",
  };

  // ── 3. Persist ai_summary to rooms table ──────────────────────────────────
  await fetch(`${sbUrl}/rest/v1/rooms?id=eq.${roomId}`, {
    method:  "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body:    JSON.stringify({ ai_summary: summary }),
  }).catch((err) => console.warn("[replay] rooms PATCH failed:", String(err)));

  // ── 4a. Fetch room title + host_id ────────────────────────────────────────
  const roomResp = await fetch(
    `${sbUrl}/rest/v1/rooms?id=eq.${roomId}&select=title,host_id&limit=1`,
    { headers: sbHeaders },
  );
  const roomRows = roomResp.ok
    ? (await roomResp.json()) as Array<{ title: string | null; host_id: string | null }>
    : [];
  const roomTitle = roomRows[0]?.title  ?? "A room";
  const hostId    = roomRows[0]?.host_id ?? null;

  // ── 4b. Fetch room_participants for this room ─────────────────────────────
  const partResp = await fetch(
    `${sbUrl}/rest/v1/room_participants?room_id=eq.${roomId}&select=user_id&limit=5000`,
    { headers: sbHeaders },
  );
  if (!partResp.ok) return;

  const participants = (await partResp.json()) as Array<{ user_id: string }>;
  if (participants.length === 0) return;

  const participantIds = participants.map((p) => p.user_id);

  // ── 5. OneSignal push: "📖 Replay ready: <room title>" ───────────────────
  if (env.ONESIGNAL_APP_ID && env.ONESIGNAL_REST_API_KEY) {
    await sendOneSignalNotification(
      env.ONESIGNAL_APP_ID,
      env.ONESIGNAL_REST_API_KEY,
      {
        externalIds: participantIds,
        headings:    { en: `📖 Replay ready: ${roomTitle}` },
        contents:    { en: "Tap to read the AI summary of what was discussed." },
        webUrl:      `/rooms/${roomId}/summary`,
        icon:        "/icons/icon-192.png",
        tag:         `room-summary-${roomId}`,
        // REPLAY-001: deep-link parser reads data.roomId (camelCase) — matches fixed parser
        data:        { type: "room_summary", roomId, roomTitle },
      },
    ).catch((err) => console.warn("[replay] OneSignal push failed:", String(err)));
  }

  // ── 6. Insert in-app notification per participant (batched) ───────────────
  const summaryPreview = summary.length > 80 ? summary.slice(0, 80) + "…" : summary;
  const rows = participantIds.map((uid) => ({
    recipient_id:  uid,
    actor_id:      hostId,
    type:          "room_summary",
    resource_id:   roomId,
    resource_type: "room",
    data: { room_title: roomTitle, summary_preview: summaryPreview },
  }));

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fetch(`${sbUrl}/rest/v1/notifications`, {
      method:  "POST",
      headers: { ...sbHeaders, Prefer: "return=minimal" },
      body:    JSON.stringify(rows.slice(i, i + CHUNK)),
    }).catch((err) => console.warn("[replay] notifications insert failed:", String(err)));
  }

  console.log(JSON.stringify({
    level:        "info",
    event:        "room_summary_notifications_sent",
    roomId,
    hostId,
    participants: participantIds.length,
    service:      "loop-api",
    timestamp:    new Date().toISOString(),
  }));
}
