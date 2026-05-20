import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { MessageCircle, Mic, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "from-emerald-500 to-teal-500",
  "from-fuchsia-500 to-purple-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-blue-500",
  "from-rose-500 to-pink-500",
  "from-mint to-mint-glow",
];
function avatarColor(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n += seed.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

type ConvoTab = "direct" | "rooms";

const DIRECT_CONVOS = [
  { id: "1", name: "Maya Okonkwo", preview: "Wild room last night", unread: 2, time: "now", type: "text" as const },
  { id: "2", name: "Chidi Eze", preview: "You should host one on fintech", unread: 1, time: "2m", type: "text" as const },
  { id: "3", name: "Fatima Al-Hassan", preview: "voice note · 0:24", unread: 0, time: "18m", type: "voice" as const },
  { id: "4", name: "Kwame Mensah", preview: "Thanks for the shoutout!", unread: 0, time: "1h", type: "text" as const },
];

const ROOM_CONVOS = [
  { id: "r1", name: "Civic Watch · Lagos", preview: "AI summary ready — pinned", unread: 0, time: "5m", participants: 142, type: "text" as const },
  { id: "r2", name: "Beats & Bars", preview: "voice note · 0:42", unread: 1, time: "23m", participants: 89, type: "voice" as const },
  { id: "r3", name: "AfroTech Weekly", preview: "Next session: Thursday 8PM", unread: 3, time: "2h", participants: 310, type: "text" as const },
];

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<ConvoTab>("direct");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const convos = tab === "direct" ? DIRECT_CONVOS : ROOM_CONVOS;
  const filtered = search
    ? convos.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : convos;

  return (
    <AppShell>
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Inbox</h1>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-surface">
            <Mic className="h-4 w-4 text-primary" />
          </button>
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 rounded-xl bg-surface p-1">
          {(["direct", "rooms"] as ConvoTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t === "direct" ? "Direct" : "Rooms"}
            </button>
          ))}
        </div>
      </header>

      {/* Conversation list */}
      <div className="space-y-1 px-5 pb-6">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No conversations found.</p>
        )}

        {filtered.map((c) => {
          const color = avatarColor(c.id);
          const hasUnread = c.unread > 0;

          return (
            <div
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 transition-colors active:bg-surface"
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className={cn(
                  "h-12 w-12 rounded-full bg-gradient-to-br flex items-center justify-center text-sm font-bold text-white",
                  color,
                )}>
                  {initials(c.name)}
                </div>
                {hasUnread && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                    {c.unread}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
                    {c.name}
                  </p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{c.time}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {c.type === "voice" && (
                    <Mic className="h-3 w-3 shrink-0 text-primary" />
                  )}
                  <p className={cn(
                    "truncate text-xs",
                    hasUnread ? "text-foreground/70" : "text-muted-foreground",
                  )}>
                    {c.preview}
                  </p>
                </div>
                {"participants" in c && typeof c.participants === "number" && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{c.participants.toLocaleString()} members</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming soon footer */}
      <div className="px-5 py-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Full messaging · coming in V2</p>
        </div>
      </div>
    </AppShell>
  );
}
