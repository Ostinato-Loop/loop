import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listRooms, type Room } from "@/lib/api/rooms";
import { Loader2, Users } from "lucide-react";

const INTERESTS = [
  "Football", "Cricket", "Politics", "Climate", "Music", "Hip-hop",
  "Afrobeats", "Tech", "Startups", "Comedy", "Cinema", "Local news",
  "Education", "Markets", "Faith",
];
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sw", label: "Kiswahili" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yoruba" },
  { code: "ig", label: "Igbo" },
  { code: "fr", label: "Francais" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portugues" },
];

const STEPS = ["username", "displayName", "language", "interests", "rooms"] as const;
type Step = typeof STEPS[number];

export default function OnboardingPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step: Step = STEPS[stepIdx];

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState("en");
  const [interests, setInterests] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [recommended, setRecommended] = useState<Room[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setLanguage(profile.language ?? "en");
      setInterests(profile.interests ?? []);
      if (profile.onboarded) navigate("/");
    }
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (step !== "rooms" || recommended.length > 0) return;
    listRooms({ limit: 6 })
      .then((rs) => setRecommended(rs))
      .catch(() => {});
  }, [step, recommended.length]);

  const toggleInterest = (i: string) =>
    setInterests((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  const usernameValid = useMemo(() => /^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase()), [username]);
  const displayValid = displayName.trim().length >= 2 && displayName.trim().length <= 40;

  const canAdvance = (): boolean => {
    switch (step) {
      case "username": return usernameValid;
      case "displayName": return displayValid;
      case "language": return !!language;
      case "interests": return interests.length >= 3;
      case "rooms": return true;
    }
  };

  const persist = async (patch: Partial<{ username: string; display_name: string; language: string; interests: string[]; onboarded: boolean }>) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
  };

  const next = async () => {
    if (!canAdvance() || busy) return;
    setBusy(true);
    try {
      if (step === "username") await persist({ username: username.trim().toLowerCase() });
      if (step === "displayName") await persist({ display_name: displayName.trim() });
      if (step === "language") await persist({ language });
      if (step === "interests") await persist({ interests });
      if (stepIdx < STEPS.length - 1) {
        setStepIdx(stepIdx + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await persist({ onboarded: true });
      await refreshProfile();
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish");
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = async (roomId: string) => {
    setBusy(true);
    try {
      await persist({ onboarded: true });
      await refreshProfile();
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-8">
      <div className="mb-6 flex gap-1.5">
        {STEPS.map((_, i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full", stepIdx >= i ? "bg-primary" : "bg-border")} />
        ))}
      </div>

      {step === "username" && (
        <div className="space-y-5">
          <h1 className="font-display text-2xl font-bold">Pick your handle</h1>
          <p className="text-sm text-muted-foreground">Lowercase letters, numbers, and underscores. 3-20 characters.</p>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="yourhandle"
              className="h-14 text-lg"
              maxLength={20}
            />
            {username && !usernameValid && (
              <p className="text-xs text-destructive">Use 3-20 lowercase letters, numbers, or underscores.</p>
            )}
          </div>
        </div>
      )}

      {step === "displayName" && (
        <div className="space-y-5">
          <h1 className="font-display text-2xl font-bold">What should we call you?</h1>
          <p className="text-sm text-muted-foreground">This is what others see in rooms.</p>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ada O."
              className="h-14 text-lg"
              maxLength={40}
            />
          </div>
        </div>
      )}

      {step === "language" && (
        <div className="space-y-5">
          <h1 className="font-display text-2xl font-bold">Choose your language</h1>
          <p className="text-sm text-muted-foreground">We'll prioritize rooms and recaps in this language.</p>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  language === l.code ? "border-primary bg-primary/10" : "border-border bg-surface",
                )}
              >
                <div className="text-sm font-semibold">{l.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "interests" && (
        <div className="space-y-5">
          <h1 className="font-display text-2xl font-bold">What moves you?</h1>
          <p className="text-sm text-muted-foreground">Pick at least 3 topics. We'll tune your feed.</p>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleInterest(i)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  interests.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground",
                )}
              >
                {i}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{interests.length} selected (min. 3)</p>
        </div>
      )}

      {step === "rooms" && (
        <div className="space-y-5">
          <h1 className="font-display text-2xl font-bold">Jump into a room</h1>
          <p className="text-sm text-muted-foreground">Or skip to explore on your own.</p>
          {recommended.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> No live rooms right now — check back soon.
            </div>
          ) : (
            <div className="space-y-3">
              {recommended.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => enterRoom(r.id)}
                  disabled={busy}
                  className="w-full rounded-2xl border border-border bg-surface p-4 text-left transition-transform active:scale-[0.98]"
                >
                  <p className="font-display font-semibold leading-tight">{r.title}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" /> {r.audience_count} listening
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-8 flex gap-3">
        {stepIdx > 0 && (
          <Button variant="secondary" onClick={() => setStepIdx((s) => s - 1)} className="h-14 flex-1 rounded-xl">
            Back
          </Button>
        )}
        {step !== "rooms" ? (
          <Button
            onClick={next}
            disabled={!canAdvance() || busy}
            className="h-14 flex-1 rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
          </Button>
        ) : (
          <Button
            onClick={finish}
            disabled={busy}
            className="h-14 flex-1 rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Start exploring"}
          </Button>
        )}
      </div>
    </div>
  );
}
