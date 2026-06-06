// Loop — Messages / Inbox (P0-005 FIX)
// Decision: Option B — Lightweight in-room chat, Supabase Realtime, no persistent DMs.
// "Direct" tab: honest empty state — DMs ship in a future sprint.
// "Rooms" tab: real room chat history from room_messages via Supabase.
// LILCKY STUDIO LIMITED

import { useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { MessageCircle, Mic, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type ConvoTab = "rooms" | "direct";

type RoomThread = {
  roomId: string;
  roomTitle: string;
  isLive: boolean;
  category: string | null;
  lastMessage: string;
  lastAt: string;
  unread: number;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ConvoTab>("rooms");
  const [threads, setThreads] = useState<RoomThread[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      // 1. Rooms this user has participated in
      const { data: parts } = await supabase
        .from("room_participants")
        .select("room_id, rooms:rooms!room_participants_room_id_fkey(id, title, is_live, category)")
        .eq("user_id", user.id)
        .limit(30);

      if (!parts || parts.length === 0) {
        setThreads([]);
        setFetching(false);
        return;
      }

      const roomIds = parts.map((p) => p.room_id as string);

      // 2. Most recent message per room
      const { data: msgs } = await supabase
        .from("room_messages")
        .select("room_id, content, created_at")
        .in("room_id", roomIds)
        .order("created_at", { ascending: false })
        .limit(roomIds.length * 5);

      // Group messages by room_id, take the latest
      const latestByRoom: Record<string, { content: string; created_at: string }> = {};
      (msgs ?? []).forEach((m) => {
        const roomId = m.room_id as string;
        if (!latestByRoom[roomId]) {
          latestByRoom[roomId] = { content: m.content as string, created_at: m.created_at as string };
        }
      });

      const result: RoomThread[] = parts
        .map((p) => {
          const room = (p.rooms as { id: string; title: string; is_live: boolean; category: string | null } | null);
          if (!room) return null;
          const last = latestByRoom[p.room_id as string];
          return {
            roomId: room.id,
            roomTitle: room.title,
            isLive: room.is_live,
            category: room.category,
            lastMessage: last?.content ?? "No messages yet",
            lastAt: last?.created_at ?? "",
            unread: 0,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (!a!.lastAt) return 1;
          if (!b!.lastAt) return -1;
          return new Date(b!.lastAt).getTime() - new Date(a!.lastAt).getTime();
        }) as RoomThread[];

      setThreads(result);
    } catch {
      setThreads([]);
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadThreads();
  }, [user, loadThreads]);

  // Live subscription: refresh on new room messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("inbox:room_messages")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "room_messages" },
        () => { void loadThreads(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, loadThreads]);

  return (
    <AppShell>
      <header className="px-5 pt-5 pb-3">
        <h1 className="font-display text-2xl font-bold">Inbox</h1>

        <div className="mt-3 flex gap-1 rounded-xl bg-secondary p-1">
          {(["rooms", "direct"] as ConvoTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t === "rooms" ? "Room chats" : "Direct"}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 pb-6">
        {tab === "rooms" && (
          <RoomsTab threads={threads} fetching={fetching} onNavigate={navigate} />
        )}
        {tab === "direct" && (
          <DirectTab onNavigate={navigate} />
        )}
      </div>
    </AppShell>
  );
}

function RoomsTab({
  threads,
  fetching,
  onNavigate,
}: {
  threads: RoomThread[];
  fetching: boolean;
  onNavigate: (path: string) => void;
}) {
  if (fetching) {
    return (
      <div className="space-y-3 pt-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-secondary animate-pulse" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
          <Mic className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-semibold text-base">No room chats yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            When you join a room, its chat will appear here.
          </p>
        </div>
        <button
          onClick={() => onNavigate("/discover")}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
        >
          Discover rooms
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-3">
      {threads.map((t) => (
        <button
          key={t.roomId}
          onClick={() => onNavigate(`/rooms/${t.roomId}`)}
          className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-primary/30 active:scale-[0.99]"
        >
          <div className="relative shrink-0">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center">
              <Mic className="h-5 w-5 text-primary" />
            </div>
            {t.isLive && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-live animate-pulse" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{t.roomTitle}</span>
              {t.isLive && (
                <span className="shrink-0 rounded-full bg-live/15 px-1.5 py-px text-[9px] font-bold uppercase text-live">
                  live
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.lastMessage}</p>
          </div>
          {t.lastAt && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(t.lastAt)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function DirectTab({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 pt-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="font-semibold text-base">Direct messages — coming soon</h2>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          DMs are on the roadmap. In the meantime, every room you join has a live chat thread — find it in the <strong>Room chats</strong> tab.
        </p>
      </div>
      <button
        onClick={() => onNavigate("/")}
        className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background"
      >
        <Users className="h-4 w-4" />
        Find a live room
      </button>
    </div>
  );
}
