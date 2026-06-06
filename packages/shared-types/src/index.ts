/**
 * @workspace/loop-shared-types
 *
 * Types shared between:
 *  - artifacts/loop        (React frontend)
 *  - artifacts/cloudflare-worker  (CF Worker backend)
 *
 * Keep this package framework-agnostic — no React, no Hono imports.
 * Plain TypeScript only.
 */

// ── Room ──────────────────────────────────────────────────────────────

// Phase H: Room types expanded to include all 7 Loop Room categories
// Community, News, Commentary, Radio, DJ Session, Education, Business
// LILCKY STUDIO LIMITED
export type RoomCategory =
  | "community"
  | "news"
  | "commentary"
  | "radio"
  | "dj-session"
  | "education"
  | "business"
  | "general";

export type RoomVisibility = "public" | "private" | "livestream";

export type ParticipantRole = "host" | "moderator" | "speaker" | "listener";

export interface Room {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  category: RoomCategory;
  visibility: RoomVisibility;
  cover_url: string | null;
  language: string | null;
  is_live: boolean;
  audience_count: number;
  tags: string[] | null;
  ai_summary: string | null;
  created_at: string;
  host?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

export interface RoomParticipant {
  user_id: string;
  room_id: string;
  role: ParticipantRole;
  joined_at: string;
}

// ── Profile ───────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  language: string | null;
  interests: string[] | null;
  is_creator: boolean;
  is_verified: boolean;
  onboarded: boolean;
}

// ── API request/response shapes ───────────────────────────────────────

/** GET /api/health */
export interface HealthResponse {
  ok: boolean;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
  bindings: {
    db: boolean;
    cache: boolean;
    media: boolean;
    taskQueue: boolean;
    roomSession: boolean;
    ai: boolean;
  };
}

/** GET /api/trending */
export interface TrendingTopic {
  label: string;
  count: number;
  category: RoomCategory;
}

export interface TrendingCreator {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  roomCount: number;
  followerCount: number;
}

export interface TrendingResponse {
  rooms: Room[];
  topics: TrendingTopic[];
  creators: TrendingCreator[];
  generatedAt: string;
}

/** GET /api/rooms/recommendations */
export interface RoomRecommendationsResponse {
  rooms: Room[];
  userId: string;
  lang: string;
  generatedAt: string;
  source: "d1" | "ai-ranked" | "placeholder";
}

/** POST /api/rooms/:roomId/queue-summary */
export interface QueueSummaryResponse {
  ok: boolean;
  queued: boolean;
  roomId: string;
}

// ── AI / content types ────────────────────────────────────────────────

export interface AiSummary {
  roomId: string;
  text: string;
  lang: string;
  generatedAt: string;
  model: string;
}

export interface TranslatedContent {
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
}

// ── Moderation ────────────────────────────────────────────────────────

export type ModerationVerdict = "ok" | "warn" | "block";

export interface ModerationResult {
  verdict: ModerationVerdict;
  score: number;
  reason?: string;
  provider: "workers-ai" | "blocklist" | "passthrough";
}

// ── Queue task payloads ───────────────────────────────────────────────

export type QueueTaskType = "ai_summary" | "moderation_review" | "notification";

export interface QueueTask {
  type: QueueTaskType;
  roomId: string;
  requestedBy: string;
  timestamp: number;
}

// ── API error envelope ────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  path?: string;
}
