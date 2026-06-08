import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLoop } from "@/lib/loop-store";
import { authedSupabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listRooms, type Room } from "@/lib/api/rooms";
import { Loader2, Search, MapPin, Globe2, ChevronRight, CheckCircle2 } from "lucide-react";
import {
  COUNTRIES, getStates, getLgas, formatLocation,
  type Country, type Region,
} from "@/lib/regions-data";

const INTERESTS = [
  "Football","Cricket","Politics","Climate","Music","Hip-hop",
  "Afrobeats","Tech","Startups","Comedy","Cinema","Local news",
  "Education","Markets","Faith",
];
const LANGUAGES = [
  { code:"en", label:"English" },
  { code:"sw", label:"Kiswahili" },
  { code:"ha", label:"Hausa" },
  { code:"yo", label:"Yoruba" },
  { code:"ig", label:"Igbo" },
  { code:"fr", label:"Francais" },
  { code:"ar", label:"Arabic" },
  { code:"pt", label:"Portugues" },
];

const STEPS = ["username","displayName","country","state","lga","language","interests","rooms"] as const;
type Step = typeof STEPS[number];

export default function OnboardingPage() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const { setInterests: setStoreInterests } = useLoop();
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step: Step = STEPS[stepIdx];

  const [username,    setUsername]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country,     setCountry]     = useState("");
  const [stateId,     setStateId]     = useState("");
  const [lgaId,       setLgaId]       = useState("");
  const [language,    setLanguage]    = useState("en");
  const [interests,   setInterests]   = useState<string[]>([]);
  const [busy,        setBusy]        = useState(false);
  const [recommended, setRecommended] = useState<Room[]>([]);

  // Search state for region pickers
  const [countryQ, setCountryQ] = useState("");
  const [stateQ,   setStateQ]   = useState("");
  const [lgaQ,     setLgaQ]     = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setLanguage(profile.language ?? "en");
      setInterests(profile.interests ?? []);
      setCountry(profile.country ?? "");
      setStateId(profile.state_id ?? "");
      setLgaId(profile.lga_id ?? "");
      if (profile.onboarded) navigate("/");
    }
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (step !== "rooms" || recommended.length > 0) return;
    listRooms({ limit: 6 }).then(setRecommended).catch(() => {});
  }, [step, recommended.length]);

  const toggleInterest = (i: string) =>
    setInterests(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]);

  const usernameValid = useMemo(() => /^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase()), [username]);
  const displayValid  = displayName.trim().length >= 2 && displayName.trim().length <= 40;

  const canAdvance = (): boolean => {
    switch (step) {
      case "username":    return usernameValid;
      case "displayName": return displayValid;
      case "country":     return !!country;
      case "state":       return true;  // optional — can skip
      case "lga":         return true;  // optional — can skip
      case "language":    return !!language;
      case "interests":   return interests.length >= 3;
      case "rooms":       return true;
    }
  };

  const persist = async (patch: Record<string, unknown>) => {
    if (!user) return;
    const { error } = await authedSupabase().from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
  };

  const next = async () => {
    if (!canAdvance() || busy) return;
    setBusy(true);
    try {
      if (step === "username")    await persist({ username: username.trim().toLowerCase() });
      if (step === "displayName") await persist({ display_name: displayName.trim() });
      if (step === "country")     await persist({ country, state_id: null, lga_id: null, lcda_id: null });
      if (step === "state")       await persist({ state_id: stateId || null });
      if (step === "lga")         await persist({ lga_id: lgaId || null });
      if (step === "language")    await persist({ language });
      if (step === "interests")   await persist({ interests });
      if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const skip = () => {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await persist({ onboarded: true });
      if (interests.length > 0) setStoreInterests(Object.fromEntries(interests.map(i => [i.toLowerCase(), true])));
      await refreshProfile();
      navigate("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete setup");
    } finally {
      setBusy(false);
    }
  };

  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  // ── Filtered region lists ─────────────────────────────────────────
  const filteredCountries = useMemo(() => {
    const q = countryQ.toLowerCase();
    return q.length < 1 ? COUNTRIES : COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [countryQ]);

  const filteredStates = useMemo(() => {
    const states = getStates(country);
    const q = stateQ.toLowerCase();
    return q.length < 1 ? states : states.filter(s => s.name.toLowerCase().includes(q));
  }, [country, stateQ]);

  const filteredLgas = useMemo(() => {
    const lgas = getLgas(stateId);
    const q = lgaQ.toLowerCase();
    return q.length < 1 ? lgas : lgas.filter(l => l.name.toLowerCase().includes(q) || l.displayLabel.toLowerCase().includes(q));
  }, [stateId, lgaQ]);

  const selectedCountry = COUNTRIES.find(c => c.code === country);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress */}
      <div className="h-1 bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full">
        {/* Step counter */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-6">
          Step {stepIdx + 1} of {STEPS.length}
        </p>

        {/* ── USERNAME ─────────────────────────────────────────────── */}
        {step === "username" && (
          <StepShell
            title="Pick your handle"
            sub="This is how people will find you on Loop. Lowercase letters, numbers and underscores only."
          >
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-medium select-none">@</span>
              <Input
                className="pl-8 h-12 text-base"
                placeholder="your_handle"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                autoFocus autoComplete="off" maxLength={20}
              />
            </div>
            {username.length > 0 && !usernameValid && (
              <p className="text-xs text-destructive">3–20 characters, letters/numbers/underscores only</p>
            )}
            <StepActions busy={busy} canAdvance={usernameValid} onNext={next} />
          </StepShell>
        )}

        {/* ── DISPLAY NAME ─────────────────────────────────────────── */}
        {step === "displayName" && (
          <StepShell title="What should we call you?" sub="Your display name. You can change this later.">
            <Input
              className="h-12 text-base"
              placeholder="Your full name or nickname"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoFocus maxLength={40}
            />
            <StepActions busy={busy} canAdvance={displayValid} onNext={next} />
          </StepShell>
        )}

        {/* ── COUNTRY ──────────────────────────────────────────────── */}
        {step === "country" && (
          <StepShell
            title="Where are you based?"
            sub="Your country anchors your region on Loop. Content is filtered to what's relevant to you."
            icon={<Globe2 className="h-6 w-6 text-primary" />}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-10"
                placeholder="Search country…"
                value={countryQ}
                onChange={e => setCountryQ(e.target.value)}
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-72 space-y-1 rounded-2xl border border-border bg-surface p-1">
              {filteredCountries.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { setCountry(c.code); setStateId(""); setLgaId(""); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                    country === c.code
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary"
                  )}
                >
                  <span className="text-xl">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  {country === c.code && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <p className="text-center py-4 text-sm text-muted-foreground">No results for "{countryQ}"</p>
              )}
            </div>
            <StepActions busy={busy} canAdvance={!!country} onNext={next} />
          </StepShell>
        )}

        {/* ── STATE ────────────────────────────────────────────────── */}
        {step === "state" && (
          <StepShell
            title={`Which ${country === "NG" ? "state" : "region"}?`}
            sub={`Your ${country === "NG" ? "state" : "region"} helps us surface the most relevant rooms and communities for you.`}
            icon={<MapPin className="h-6 w-6 text-primary" />}
          >
            {selectedCountry && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span>{selectedCountry.flag}</span>
                <span>{selectedCountry.name}</span>
              </div>
            )}
            {filteredStates.length > 0 ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-10"
                    placeholder="Search state…"
                    value={stateQ}
                    onChange={e => setStateQ(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto max-h-64 space-y-1 rounded-2xl border border-border bg-surface p-1">
                  {filteredStates.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setStateId(s.id); setLgaId(""); }}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                        stateId === s.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-secondary"
                      )}
                    >
                      <span className="flex-1">{s.name}</span>
                      {stateId === s.id && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                  {filteredStates.length === 0 && (
                    <p className="text-center py-4 text-sm text-muted-foreground">No results</p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">State/region data coming soon for {selectedCountry?.name}</p>
              </div>
            )}
            <StepActions busy={busy} canAdvance onNext={next} onSkip={skip} skipLabel="Skip for now" />
          </StepShell>
        )}

        {/* ── LGA ──────────────────────────────────────────────────── */}
        {step === "lga" && (
          <StepShell
            title="Your local area"
            sub="The most precise level — helps you find people and rooms from your exact neighbourhood."
            icon={<MapPin className="h-6 w-6 text-primary" />}
          >
            {filteredLgas.length > 0 ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-10"
                    placeholder="Search area, LGA, LCDA…"
                    value={lgaQ}
                    onChange={e => setLgaQ(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="overflow-y-auto max-h-64 space-y-1 rounded-2xl border border-border bg-surface p-1">
                  {(lgaQ.length > 0
                    ? filteredLgas.filter(l => l.name.toLowerCase().includes(lgaQ.toLowerCase()))
                    : filteredLgas
                  ).map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLgaId(l.id)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left",
                        lgaId === l.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-secondary"
                      )}
                    >
                      <span className="flex-1">{l.name}</span>
                      {lgaId === l.id && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-1">
                <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-medium">No local areas yet for this state</p>
                <p className="text-xs text-muted-foreground">We're adding more areas soon. Skip for now.</p>
              </div>
            )}
            <StepActions busy={busy} canAdvance onNext={next} onSkip={skip} skipLabel="Skip for now" />
          </StepShell>
        )}

        {/* ── LANGUAGE ─────────────────────────────────────────────── */}
        {step === "language" && (
          <StepShell title="Your primary language" sub="Used to surface relevant rooms and filter noise.">
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm font-semibold transition-all",
                    language === l.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface hover:border-primary/40"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <StepActions busy={busy} canAdvance={!!language} onNext={next} />
          </StepShell>
        )}

        {/* ── INTERESTS ────────────────────────────────────────────── */}
        {step === "interests" && (
          <StepShell title="What moves you?" sub="Pick at least 3. This shapes your feed and the rooms we surface.">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleInterest(i)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                    interests.includes(i)
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface hover:border-primary/40"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{interests.length} selected — need at least 3</p>
            <StepActions busy={busy} canAdvance={interests.length >= 3} onNext={next} />
          </StepShell>
        )}

        {/* ── ROOMS ────────────────────────────────────────────────── */}
        {step === "rooms" && (
          <StepShell
            title="You're in the Loop"
            sub={
              country
                ? `Here's what's live near you right now.`
                : "Here's what's live right now. Complete your region to find nearby conversations."
            }
          >
            {recommended.length > 0 ? (
              <div className="space-y-2">
                {recommended.slice(0,4).map(r => (
                  <div key={r.id} className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-base">🎙️</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.audience_count} listening</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">No live rooms right now — be the first to start one.</p>
              </div>
            )}
            <Button
              className="w-full h-12 text-base font-bold mt-4 neon-glow"
              onClick={finish}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enter Loop →"}
            </Button>
          </StepShell>
        )}
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────

function StepShell({
  title, sub, icon, children,
}: {
  title: string; sub: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <div className="space-y-2">
        {icon && <div className="mb-1">{icon}</div>}
        <h1 className="font-display text-2xl font-bold leading-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function StepActions({
  busy, canAdvance, onNext, onSkip, skipLabel = "Skip",
}: {
  busy: boolean;
  canAdvance: boolean;
  onNext: () => void;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="mt-auto pt-4 flex flex-col gap-2">
      <Button
        className="w-full h-12 text-base font-bold"
        onClick={onNext}
        disabled={!canAdvance || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ChevronRight className="h-4 w-4 ml-1" /></>}
      </Button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground py-2 hover:text-foreground transition-colors"
        >
          {skipLabel}
        </button>
      )}
    </div>
  );
}
