import type { CloudflareEnv } from "../types/env.js";
import type { RoomRecommendationsResponse } from "@workspace/loop-shared-types";

interface RecommendationOptions {
  userId: string;
  limit: number;
  lang: string;
}

/**
 * Room recommendations service.
 *
 * Phase 1 — returns empty list (unblocks frontend)
 * Phase 2 — D1 query: JOIN user interests → room tags, score by audience_count
 * Phase 3 — blend with Workers AI embeddings for semantic matching
 */
export async function getRecommendations(
  env: CloudflareEnv,
  opts: RecommendationOptions,
): Promise<RoomRecommendationsResponse> {
  // ── Phase 2 stub ────────────────────────────────────────────────────
  // const userProfile = await env.DB.prepare(
  //   "SELECT interests, language FROM profiles WHERE id = ?"
  // ).bind(opts.userId).first();
  //
  // const rooms = await env.DB.prepare(`
  //   SELECT r.*, p.display_name as host_name
  //   FROM rooms r JOIN profiles p ON r.host_id = p.id
  //   WHERE r.is_live = 1 AND r.language = ?
  //   ORDER BY r.audience_count DESC LIMIT ?
  // `).bind(opts.lang, opts.limit).all();

  return {
    rooms: [],
    userId: opts.userId,
    lang: opts.lang,
    generatedAt: new Date().toISOString(),
    source: "placeholder",
  };
}
