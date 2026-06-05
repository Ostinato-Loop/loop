import { useNavigate, useParams } from "react-router-dom";
  import { useEffect, useState } from "react";
  import { useAuth } from "@/hooks/use-auth";
  import { AppShell } from "@/components/layout/app-shell";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";
  import { Button } from "@/components/ui/button";
  import { createRoom, type RoomCategory, type RoomVisibility } from "@/lib/api/rooms";
  import { toast } from "sonner";
  import { cn } from "@/lib/utils";
  import { Clock } from "lucide-react";

  const CATS: { key: RoomCategory; label: string }[] = [
    { key: "general", label: "General" },
    { key: "sports", label: "Sports" },
    { key: "civic", label: "Civic" },
    { key: "music", label: "Music" },
    { key: "entertainment", label: "Culture" },
    { key: "news", label: "News" },
  ];
  const VIS: { key: RoomVisibility; label: string; sub: string }[] = [
    { key: "public", label: "Public", sub: "Anyone can join" },
    { key: "private", label: "Private", sub: "Invite-only" },
    { key: "livestream", label: "Livestream", sub: "Broadcast-style" },
  ];

  // Create types not yet built — show honest coming-soon placeholder
  const COMING_SOON: Record<string, { label: string; desc: string }> = {
    discussion: { label: "Discussion",  desc: "Public threaded discussions are coming soon." },
    event:      { label: "Event",       desc: "Regional event scheduling is coming soon." },
    community:  { label: "Community",   desc: "Community groups are coming soon." },
    post:       { label: "Post",        desc: "Photo and media posts are coming soon." },
    article:    { label: "Article",     desc: "Long-form publishing is coming soon." },
  };

  export default function CreatePage() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const { kind } = useParams<{ kind?: string }>();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState<RoomCategory>("general");
    const [visibility, setVisibility] = useState<RoomVisibility>("public");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      if (!loading && !user) navigate("/login");
    }, [user, loading, navigate]);

    // Non-room create types — show honest placeholder
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
      if (!title.trim()) return;
      setBusy(true);
      try {
        if (!user) throw new Error("Not signed in");
        const room = await createRoom(user.id, { title: title.trim(), description, category, visibility });
        toast.success("Room started");
        navigate(`/rooms/${room.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create room");
      } finally {
        setBusy(false);
      }
    };

    return (
      <AppShell>
        <header className="px-5 pt-5 pb-2">
          <h1 className="font-display text-2xl font-bold">Start a room</h1>
          <p className="text-sm text-muted-foreground">Go live in seconds. You can change settings later.</p>
        </header>
        <form onSubmit={submit} className="space-y-5 px-5 py-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening?"
              className="h-12"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    category === c.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
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
          <Button
            type="submit"
            disabled={busy || !title.trim()}
            className="h-12 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
          >
            {busy ? "Starting…" : "Go live"}
          </Button>
        </form>
      </AppShell>
    );
  }
  