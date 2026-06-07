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
 *
 * V2.1 (2026-06-07): Community Infrastructure Sprint.
 * Adds: CommunityType, CommunityModeratorPermissions, CommunityModerator, CommunityRule.
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

export type CommunityRole = "owner" | "admin" | "moderator" | "member" | "banned";

/** V1 community type taxonomy (from community-architecture-v1.md) */
export type CommunityType =
  | "regional_state"
  | "regional_lga"
  | "regional_lcda"
  | "regional_city"
  | "interest"
  | "creator_artist"
  | "creator_dj"
  | "creator_radio"
  | "creator_podcaster"
  | "creator_sports";

/** Moderator permission object — all keys default false */
export interface CommunityModeratorPermissions {
  can_remove_members:    boolean;
  can_mute_members:      boolean;
  can_pin_announcements: boolean;
  can_approve_rooms:     boolean;
  can_remove_rooms:      boolean;
  can_ban_members:       boolean;
  can_edit_rules:        boolean;
  can_manage_events:     boolean;
}

export interface Community {
  id:               string;
  name:             string;
  slug:             string;
  description:      string | null;
  cover_url:        string | null;
  category:         CommunityCategory;
  visibility:       CommunityVisibility;
  owner_id:         string;
  member_count:     number;
  room_count:       number;
  active_room_count: number;
  is_verified:      boolean;
  // V1 fields (added in migration 007)
  type?:            CommunityType;
  region_id?:       string | null;
  region_scope?:    string | null;
  country_code?:    string;
  is_civic?:        boolean;
  health_score?:    number;
  interest_tags?:   string[];
  is_system?:       boolean;
  is_suspended?:    boolean;
  is_deleted?:      boolean;
  created_at:       string;
  updated_at:       string;
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

/** V1: Moderator with granular permission set */
export interface CommunityModerator {
  id:           string;
  community_id: string;
  user_id:      string;
  promoted_by:  string;
  permissions:  CommunityModeratorPermissions;
  promoted_at:  string;
  revoked_at:   string | null;
  is_active:    boolean;
  profile?: {
    username:     string | null;
    display_name: string | null;
    avatar_url:   string | null;
  };
}

/** V1: Numbered community rule */
export interface CommunityRule {
  id:           string;
  community_id: string;
  rule_number:  number;
  title:        string;
  body:         string;
  created_by:   string;
  updated_by:   string | null;
  created_at:   string;
  updated_at:   string;
}

// ── Community API shapes ──────────────────────────────────────────────

export interface CreateCommunityRequest {
  name:         string;
  slug?:        string;
  description?: string;
  cover_url?:   string;
  category:     CommunityCategory;
  visibility?:  CommunityVisibility;
}

export interface UpdateCommunityRequest {
  name?:        string;
  description?: string;
  cover_url?:   string;
  category?:    CommunityCategory;
  visibility?:  CommunityVisibility;
}

export interface AppointModeratorRequest {
  user_id:      string;
  permissions?: Partial<CommunityModeratorPermissions>;
}

export interface CreateRuleRequest {
  rule_number: number;
  title:       string;
  body:        string;
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

/** GET /api/communities/nearby */
export interface NearbyCommunitiesResponse {
  communities:     Community[];
  detected_region: string;
  merge_level:     "lcda" | "lga" | "state" | "national" | "interest";
  count:           number;
}

// ── Room ──────────────────────────────────────────────────────────────

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
  community_id:   string | null;
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

export interface RoomListResponse {
  rooms:  Room[];
  count:  number;
  offset: number;
  limit:  number;
}

export interface RoomRecommendationsResponse {
  rooms:       Room[];
  userId:      string;
  lang:        string;
  generatedAt: string;
  source:      "d1" | "ai-ranked" | "placeholder";
}

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
