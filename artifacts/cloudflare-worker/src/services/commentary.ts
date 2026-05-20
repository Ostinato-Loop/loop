import type { CloudflareEnv } from "../types/env.js";

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
 */

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
 * Generate a post-room AI summary and push to KV.
 * Called from the Queue consumer after a room ends.
 */
export async function generateRoomSummary(
  env: CloudflareEnv,
  roomId: string,
  transcript: string,
): Promise<string> {
  const cacheKey = `summary:${roomId}`;

  // TODO: implement
  // const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
  //   messages: [
  //     { role: "system", content: "Summarise this room transcript in 2 sentences." },
  //     { role: "user", content: transcript },
  //   ],
  // });

  const summary = `AI summary pending for room ${roomId}.`;
  await env.CACHE.put(cacheKey, summary, { expirationTtl: 86400 });
  return summary;
}
