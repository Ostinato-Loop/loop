/**
 * @workspace/loop-shared-types
 *
 * Types shared between:
 *  - artifacts/loop        (React frontend)
 *  - artifacts/cloudflare-worker  (CF Worker backend)
 *
 * Keep this package framework-agnostic — no React, no Hono imports.
 * Plain TypeScript only.
 *
 * V2 (2026-06-07): Communities are the primary entity.
 * Rooms belong to communities. Everything revolves around communities.
 */

// ── Community ─────────────────────────────────────────────────────────

export type CommunityCategory =
  | "technology"
  | "culture"
  | "education"
  | "sports"
  | "faith"
  | "business"
  | "local"
  | "news"
  | "entertainment"
  | "health"
  | "general";

export type CommunityVisibility =
  | "public"       // discoverable, anyone can join
  | "private"      // discoverable, join by request
  | "invite_only"; // not discoverable, join by invite only

export type CommunityRole = "owner" | "admin" | "member";

export interface Community {
  id:            string;
  name:          string;
  slug:          string;               // unique, URL-safe identifier
  description:   string | null;
  cover_url:     string | null;
  category:      CommunityCategory;
  visibility:    CommunityVisibility;
  owner_id:      string;
  member_count:  number;
  room_count:    number;
  is_verified:   boolean;
  created_at:    string;
  updated_at:    string;
  owner?: {
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
    is_verified:  boolean;
  };
}

export interface CommunityMember {
  community_id: string;
  user_id:      string;
  role:         CommunityRole;
  joined_at:    string;
  profile?: {
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
    is_verified:  boolean;
  };
}

// ── Community API shapes ──────────────────────────────────────────────

export interface CreateCommunityRequest {
  name:        string;
  slug?:       string;               // auto-generated from name if omitted
  description?: string;
  cover_url?:  string;
  category:    CommunityCategory;
  visibility?: CommunityVisibility;  // default: "public"
}

export interface UpdateCommunityRequest {
  name?:        string;
  description?: string;
  cover_url?:   string;
  category?:    CommunityCategory;
  visibility?:  CommunityVisibility;
}

/** GET /api/communities */
export interface CommunityListResponse {
  communities: Community[];
  count:       number;
  offset:      number;
  limit:       number;
}

/** GET /api/communities/:slug */
export interface CommunityDetailResponse {
  community:   Community;
  is_member:   boolean;
  member_role: CommunityRole | null;
}

/** POST /api/communities/:id/join */
export interface JoinCommunityResponse {
  ok:   boolean;
  role: CommunityRole;
}

/** GET /api/communities/:id/members */
export interface CommunityMembersResponse {
  members: CommunityMember[];
  count:   number;
  offset:  number;
  limit:   number;
}

// ── Room ──────────────────────────────────────────────────────────────

// Phase H: Room types expanded to include all 7 Loop Room categories
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
  id:             string;
  host_id:        string;
  community_id:   string | null;      // V2: rooms belong to communities
  title:          string;
  description:    string | null;
  category:       RoomCategory;
  visibility:     RoomVisibility;
  cover_url:      string | null;
  language:       string | null;
  is_live:        boolean;
  audience_count: number;
  tags:           string[] | null;
  ai_summary:     string | null;
  created_at:     string;
  host?: {
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
    is_verified:  boolean;
  };
  community?: Pick<Community, "id" | "name" | "slug" | "cover_url"> | null;
}

export interface RoomParticipant {
  user_id:   string;
  room_id:   string;
  role:      ParticipantRole;
  joined_at: string;
}

// ── Profile ───────────────────────────────────────────────────────────

export interface Profile {
  id:           string;
  username:     string | null;
  display_name: string | null;
  avatar_url:   string | null;
  bio:          string | null;
  language:     string | null;
  interests:    string[] | null;
  is_creator:   boolean;
  is_verified:  boolean;
  onboarded:    boolean;
}

// ── API request/response shapes ───────────────────────────────────────

/** GET /api/health */
export interface HealthResponse {
  ok:          boolean;
  service:     string;
  version:     string;
  environment: string;
  timestamp:   string;
  bindings: {
    db:          boolean;
    cache:       boolean;
    media:       boolean;
    taskQueue:   boolean;
    roomSession: boolean;
    ai:          boolean;
  };
}

/** GET /api/trending */
export interface TrendingTopic {
  label:    string;
  count:    number;
  category: RoomCategory;
}

export interface TrendingCreator {
  userId:        string;
  displayName:   string;
  avatarUrl:     string | null;
  roomCount:     number;
  followerCount: number;
}

export interface TrendingResponse {
  rooms:        Room[];
  topics:       TrendingTopic[];
  creators:     TrendingCreator[];
  generatedAt:  string;
}

/** GET /api/rooms */
export interface RoomListResponse {
  rooms:  Room[];
  count:  number;
  offset: number;
  limit:  number;
}

/** GET /api/rooms/recommendations */
export interface RoomRecommendationsResponse {
  rooms:       Room[];
  userId:      string;
  lang:        string;
  generatedAt: string;
  source:      "d1" | "ai-ranked" | "placeholder";
}

/** POST /api/rooms/:roomId/queue-summary */
export interface QueueSummaryResponse {
  ok:     boolean;
  queued: boolean;
  roomId: string;
}

// ── AI / content types ────────────────────────────────────────────────

export interface AiSummary {
  roomId:      string;
  text:        string;
  lang:        string;
  generatedAt: string;
  model:       string;
}

export interface TranslatedContent {
  original:   string;
  translated: string;
  sourceLang: string;
  targetLang: string;
}

// ── Moderation ────────────────────────────────────────────────────────

export type ModerationVerdict = "ok" | "warn" | "block";

export interface ModerationResult {
  verdict:  ModerationVerdict;
  score:    number;
  reason?:  string;
  provider: "workers-ai" | "blocklist" | "passthrough";
}

// ── Queue task payloads ───────────────────────────────────────────────

export type QueueTaskType = "ai_summary" | "moderation_review" | "notification";

export interface QueueTask {
  type:        QueueTaskType;
  roomId:      string;
  requestedBy: string;
  timestamp:   number;
}

// ── API error envelope ────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
  path?: string;
}
