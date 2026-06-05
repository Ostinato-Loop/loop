import { supabase } from "@/integrations/supabase/client";

  export type RoomCategory = "sports" | "civic" | "music" | "entertainment" | "general" | "news";
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
    // PGRST205 = relation not found in PostgREST schema cache
    if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
      console.warn(`[rooms] ${context}: schema cache miss — table may be initialising`);
      return new Error("Rooms are temporarily unavailable. Please try again in a moment.");
    }
    // 42501 = RLS permission denied
    if (error.code === "42501") return new Error("You don't have permission to perform this action.");
    // 23503 = FK violation (e.g. host profile missing)
    if (error.code === "23503") return new Error("Your profile isn't set up yet. Please complete onboarding first.");
    // 23505 = unique violation
    if (error.code === "23505") return new Error("A room with these details already exists.");
    // Network / unknown
    console.error(`[rooms] ${context} error:`, error.code, error.message);
    return new Error("Something went wrong. Please try again.");
  }

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
      // PGRST205 during cold start — return empty list silently
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

  /** createRoom — userId comes from useAuth().user.id (Loop custom JWT) */
  export async function createRoom(
    userId: string,
    input: {
      title: string;
      description?: string;
      category: RoomCategory;
      visibility: RoomVisibility;
      tags?: string[];
    },
  ): Promise<Room> {
    if (!userId) throw new Error("Not signed in");
    const { data, error } = await supabase
      .from("rooms")
      .insert({
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        visibility: input.visibility,
        tags: input.tags ?? [],
        host_id: userId,
      })
      .select("*")
      .single();
    if (error) throw sanitiseRoomError(error, "createRoom");
    await supabase.from("room_participants").insert({
      room_id: data.id,
      user_id: userId,
      role: "host",
    });
    return data as Room;
  }

  export async function joinRoom(roomId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("room_participants")
      .upsert({ room_id: roomId, user_id: userId, role: "listener" }, { onConflict: "room_id,user_id" });
    if (error) throw sanitiseRoomError(error, "joinRoom");
  }

  export async function leaveRoom(roomId: string, userId: string): Promise<void> {
    await supabase.from("room_participants").delete().match({ room_id: roomId, user_id: userId });
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

  export async function sendMessage(roomId: string, userId: string, content: string): Promise<void> {
    const { error } = await supabase.from("room_messages").insert({ room_id: roomId, user_id: userId, content });
    if (error) throw sanitiseRoomError(error, "sendMessage");
  }

  export async function sendReaction(roomId: string, userId: string, emoji: string): Promise<void> {
    const { error } = await supabase.from("room_reactions").insert({ room_id: roomId, user_id: userId, emoji });
    if (error) throw sanitiseRoomError(error, "sendReaction");
  }
  