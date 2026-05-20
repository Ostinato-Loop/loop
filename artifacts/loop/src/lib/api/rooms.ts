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

export async function listRooms(opts?: { category?: RoomCategory; limit?: number }) {
  let q = supabase
    .from("rooms")
    .select("*, host:profiles!rooms_host_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("is_live", true)
    .order("audience_count", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Room[];
}

export async function getRoom(id: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("*, host:profiles!rooms_host_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
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
) {
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
  if (error) throw error;
  await supabase.from("room_participants").insert({
    room_id: data.id,
    user_id: userId,
    role: "host",
  });
  return data as Room;
}

export async function joinRoom(roomId: string, userId: string) {
  const { error } = await supabase
    .from("room_participants")
    .upsert({ room_id: roomId, user_id: userId, role: "listener" }, { onConflict: "room_id,user_id" });
  if (error) throw error;
}

export async function leaveRoom(roomId: string, userId: string) {
  await supabase.from("room_participants").delete().match({ room_id: roomId, user_id: userId });
}

export async function listParticipants(roomId: string) {
  const { data, error } = await supabase
    .from("room_participants")
    .select("role, joined_at, user_id, profiles:profiles!room_participants_user_id_fkey(username, display_name, avatar_url, is_verified)")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listMessages(roomId: string, limit = 50) {
  const { data, error } = await supabase
    .from("room_messages")
    .select("*, profiles:profiles!room_messages_user_id_fkey(username, display_name, avatar_url)")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(roomId: string, userId: string, content: string) {
  const { error } = await supabase.from("room_messages").insert({ room_id: roomId, user_id: userId, content });
  if (error) throw error;
}

export async function sendReaction(roomId: string, userId: string, emoji: string) {
  const { error } = await supabase.from("room_reactions").insert({ room_id: roomId, user_id: userId, emoji });
  if (error) throw error;
}
