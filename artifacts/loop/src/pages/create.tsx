import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createRoom, type RoomCategory, type RoomVisibility, type RoomType } from "@/lib/api/rooms";
import { authFetch } from "@/lib/api-fetch";
import { useRoomQuota } from "@/hooks/use-room-quota";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Clock, Shield, Star, Users } from "lucide-react";

// Phase H: All 7 Loop Room Types fully wired for room creation
// PUSH-001 (2026-06-10): Notify followers via push when room goes live.
// RATE-LIMIT-001 (2026-06-10): Quota badge + button guard via useRoomQuota.
// LILCKY STUDIO LIMITED

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const CATS: { key: RoomCategory; label: string; emoji: string; desc: string }[] = [
  { key: "community",  label: "Community",   emoji: "🏘️", desc: "Local voices, neighbourhood talk" },
  { key: "news",       label: "News",        emoji: "📡", desc: "Breaking news & verified updates" },
  { key: "commentary", label: "Commentary",  emoji: "🎙️", desc: "Analysis, opinions & reactions" },
  { key: "radio",      label: "Radio",       emoji: "📻", desc: "Broadcast-style audio stream" },
  { key: "dj-session", label: "DJ Session",  emoji: "🎧", desc: "Live music sets & mixes" },
  { key: "education",  label: "Education",   emoji: "📚", desc: "Lectures, learning & knowledge" },
  { key: "business",   label: "Business",    emoji: "💼", desc: "Industry talk, deals & networking" },
  { key: "general",    label: "General",     emoji: "💬", desc: "Open conversation" },
];

const VIS: { key: RoomVisibility; label: string; sub: string }[] = [
  { key: "public",      label: "Public",      sub: "Anyone can join" },
  { key: "private",     label: "Private",     sub: "Invite-only" },
  { key: "livestream",  label: "Livestream",  sub: "Broadcast-style" },
];

const COMING_SOON: Record<string, { label: string; desc: string }> = {
  discussion: { label: "Discussion",  desc: "Public threaded discussions are coming soon." },
  event:      { label: "Event",       desc: "Regional event scheduling is coming soon." },
  post:       { label: "Post",        desc: "Photo and media posts are coming soon." },
  article:    { label: "Article",     desc: "Long-form publishing is coming soon." },
  community:  { label: "Community",   desc: "Community creation is coming in a future sprint." },
};

/** Fire-and-forget: notify followers that this host just went live. */
function notifyRoomLive(hostId: string, roomId: string, roomTitle: string, category: string) {
  authFetch(`${API_BASE}/api/push/notify-room-live`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostId, roomId, roomTitle, category }),
  }).catch(() => {
    // Non-critical — swallow silently; push delivery failure must never block room creation
  });
}

export default function CreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { kind } = useParams<{ kind?: string }>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RoomCategory>("community");
  const [roomType, setRoomType] = useState<RoomType>("SOCIAL");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [busy, setBusy] = useState(false);

  const { quota, refetch: refetchQuota } = useRoomQuota(user?.id ?? null);
  const atLimit = quota !== null && quota.remaining === 0;

  // Auth gate now handled by ProtectedRoute in App.tsx

  const comingSoon = kind && kind !== "room" ? COMING_SOON[kind] : null;
  if (comingSoon) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-5">
          <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold">{comingSoon.label}</h1>
            <p className="text-sm text-muted-foreground max-w-xs">{comingSoon.desc}</p>
            <p className="text-xs text-muted-foreground pt-1">
              For now, start an Audio Room — it's live and working.
            </p>
          </div>
          <Button
            onClick={() => navigate("/create/room")}
            className="h-11 rounded-xl px-6 bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
          >
            Start an Audio Room instead
          </Button>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Go back
          </button>
        </div>
      </AppShell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || atLimit) return;
    setBusy(true);
    try {
      if (!user) throw new Error("Not signed in");
      const room = await createRoom(user.id, { title: title.trim(), description, category, visibility });
      track("room_create", { room_id: room.id, category, visibility });

      // Sync quota counter then notify followers — both non-blocking
      refetchQuota();
      notifyRoomLive(user.id, room.id, title.trim(), category);

      toast.success("Room started");
      navigate(`/rooms/${room.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setBusy(false);
    }
  };

  const selected = CATS.find(c => c.key === category);

  return (
    <AppShell>
      <header className="px-5 pt-5 pb-2">
        <h1 className="font-display text-2xl font-bold">Start a room</h1>
        <p className="text-sm text-muted-foreground">Go live in seconds. You can change settings later.</p>
      </header>
      <form onSubmit={submit} className="space-y-5 px-5 py-4 pb-8">
        {/* Room Type */}
        <div className="space-y-2">
          <Label>Room Type</Label>
          <div className="grid grid-cols-2 gap-2">
            {CATS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  category === c.key
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface",
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">{c.emoji}</span>
                  <span className="text-sm font-semibold">{c.label}</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">{c.desc}</div>
              </button>
            ))}
          </div>
          {selected && (
            <p className="text-xs text-primary font-medium px-1">
              {selected.emoji} {selected.label}: {selected.desc}
            </p>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's happening?"
            className="h-12"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label>Description (optional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>

        {/* Visibility */}
        <div className="space-y-2">
          <Label>Visibility</Label>
          <div className="grid grid-cols-3 gap-2">
            {VIS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setVisibility(v.key)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  visibility === v.key ? "border-primary bg-primary/10" : "border-border bg-surface",
                )}
              >
                <div className="text-sm font-semibold">{v.label}</div>
                <div className="text-[10px] text-muted-foreground">{v.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quota badge — only shown once server responds */}
        {quota !== null && (
          <div
            className={cn(
              "flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
              atLimit
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-surface text-muted-foreground",
            )}
          >
            <span>
              {atLimit
                ? "Daily room limit reached — resets in 24 h"
                : `${quota.remaining} room${quota.remaining === 1 ? "" : "s"} left today`}
            </span>
            <span className="font-mono text-xs opacity-70">
              {quota.used}/{quota.limit}
            </span>
          </div>
        )}

        <Button
          type="submit"
          disabled={busy || !title.trim() || atLimit}
          className={cn(
            "h-12 w-full rounded-xl font-semibold transition-colors",
            atLimit
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-gradient-mint text-primary-foreground shadow-mint",
          )}
        >
          {busy ? "Starting…" : atLimit ? "Limit reached — try tomorrow" : "Go live"}
        </Button>
      </form>
    </AppShell>
  );
}
