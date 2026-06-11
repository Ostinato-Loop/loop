import { supabase, authedSupabase } from "@/integrations/supabase/client";
import { authFetch } from "@/lib/api-fetch";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

// Phase H: Room types expanded to include all 7 Loop Room categories
// Community, News, Commentary, Radio, DJ Session, Education, Business
// LILCKY STUDIO LIMITED

// Civic Engine Phase 1 — three independent room classifications
export type RoomType = "SOCIAL" | "CREATOR" | "CIVIC";

export type VerificationLevel =
  | "UNVERIFIED"
  | "WITNESSED"
  | "LOCALLY_VERIFIED"
  | "OFFICIALLY_CONFIRMED";

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

export type Room = {
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
  host?: { username: string | null; display_name: string | null; avatar_url: string | null; is_verified: boolean };
};

/** Converts raw Supabase/PostgREST errors into user-safe messages. */
function sanitiseRoomError(error: { code?: string; message?: string }, context: string): Error {
  if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
    console.warn(`[rooms] ${context}: schema cache miss`);
    return new Error("Rooms are temporarily unavailable. Please try again in a moment.");
  }
  if (error.code === "42501") return new Error("You don't have permission to perform this action.");
  if (error.code === "23503") return new Error("Your profile isn't set up yet. Please complete onboarding first.");
  if (error.code === "23505") return new Error("A room with these details already exists.");
  console.error(`[rooms] ${context} error:`, error.code, error.message);
  return new Error("Something went wrong. Please try again.");
}

// ── Public reads — anon client, no auth token required ──────────────────────

export async function listRooms(opts?: { category?: RoomCategory; limit?: number }): Promise<Room[]> {
  let q = supabase
    .from("rooms")
    .select("*, host:profiles!rooms_host_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("is_live", true)
    .order("audience_count", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      console.warn("[rooms] listRooms: schema cache miss, returning []");
      return [];
    }
    throw sanitiseRoomError(error, "listRooms");
  }
  return (data ?? []) as Room[];
}

export async function getRoom(id: string): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select("*, host:profiles!rooms_host_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) return null;
    throw sanitiseRoomError(error, "getRoom");
  }
  return data as Room | null;
}

export async function listParticipants(roomId: string) {
  const { data, error } = await supabase
    .from("room_participants")
    .select("role, joined_at, user_id, profiles:profiles!room_participants_user_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw sanitiseRoomError(error, "listParticipants");
  return data ?? [];
}

export async function listMessages(roomId: string, limit = 50) {
  const { data, error } = await supabase
    .from("room_messages")
    .select("*, profiles:profiles!room_messages_user_id_fkey(username, display_name, avatar_url)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw sanitiseRoomError(error, "listMessages");
  return data ?? [];
}

// ── Authenticated writes — authed client, loop_token in Authorization header ─

/** createRoom — creates the room via the Loop Worker (rate-limited: 3 per 24h).
 *
 * RATE-LIMIT-001 (2026-06-10): Routed through POST /api/rooms in the Cloudflare
 * Worker, which enforces a per-user creation cap of 3 rooms per 24 hours.
 */
export async function createRoom(
  _userId: string,
  input: {
    title: string;
    description?: string;
    category: RoomCategory;
    visibility: RoomVisibility;
    tags?: string[];
  },
): Promise<Room> {
  const res = await authFetch(`${API_BASE}/api/rooms`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(input),
  });
  if (res.status === 429) throw new Error("Room creation limit reached (max 3 per 24 hours)");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create room" })) as { error?: string };
    throw new Error(err.error ?? "Failed to create room");
  }
  return res.json() as Promise<Room>;
}

/** Mark a room live or ended. */
export async function setRoomLive(roomId: string, isLive: boolean): Promise<void> {
  await authedSupabase()
    .from("rooms")
    .update({ is_live: isLive })
    .eq("id", roomId);
}

/** Increment/decrement audience_count by delta. */
export async function adjustAudienceCount(roomId: string, delta: 1 | -1): Promise<void> {
  const db = authedSupabase();
  const { data } = await db.from("rooms").select("audience_count").eq("id", roomId).single();
  if (data) {
    const next = Math.max(0, (data.audience_count ?? 0) + delta);
    await db.from("rooms").update({ audience_count: next }).eq("id", roomId);
  }
}

export async function joinRoom(roomId: string, userId: string): Promise<void> {
  const db = authedSupabase();
  const { error } = await db
    .from("room_participants")
    .upsert({ room_id: roomId, user_id: userId, role: "listener" }, { onConflict: "room_id,user_id" });
  if (error) throw sanitiseRoomError(error, "joinRoom");
  await adjustAudienceCount(roomId, 1).catch(() => null);
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await authedSupabase().from("room_participants").delete().match({ room_id: roomId, user_id: userId });
  await adjustAudienceCount(roomId, -1).catch(() => null);
}

export async function sendMessage(roomId: string, userId: string, content: string): Promise<void> {
  const { error } = await authedSupabase()
    .from("room_messages")
    .insert({ room_id: roomId, user_id: userId, content });
  if (error) throw sanitiseRoomError(error, "sendMessage");
}

export async function sendReaction(roomId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await authedSupabase()
    .from("room_reactions")
    .insert({ room_id: roomId, user_id: userId, emoji });
  if (error) throw sanitiseRoomError(error, "sendReaction");
}

/**
 * endRoom — host formally ends a live room.
 *
 * Calls DELETE /api/rooms/:roomId on the Loop Worker, which:
 *   1. Verifies the caller is the host (403 if not)
 *   2. Sets is_live = false, audience_count = 0
 *   3. Removes all room_participants
 *   4. Deletes the LiveKit room (kicks all audio)
 *   5. Queues an AI summary task
 *
 * ROOM-END-001 (2026-06-10): Replaces the previous client-side setRoomLive call
 * which had no host verification and left participants stranded in LiveKit.
 */
export async function endRoom(roomId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/rooms/${roomId}`, { method: 'DELETE' });
  if (res.status === 403) throw new Error('Only the host can end this room.');
  if (res.status === 404) throw new Error('Room not found.');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to end room. Please try again.');
  }
}

/**
 * updateRoom — host edits mutable room fields.
 * Calls PATCH /api/rooms/:roomId on the Loop Worker.
 */
export async function updateRoom(
  roomId: string,
  patch: { title?: string; description?: string; visibility?: RoomVisibility },
): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/rooms/${roomId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.status === 403) throw new Error('Only the host can edit this room.');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to update room.');
  }
}

