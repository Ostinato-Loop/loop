import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth, setLoopToken } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Radio, Loader2, ArrowLeft, ChevronDown, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/* ─── country list ──────────────────────────────────────────────────── */
type Country = { code: string; flag: string; name: string; dial: string };
const COUNTRIES: Country[] = [
  { code: "NG", flag: "🇳🇬", name: "Nigeria",        dial: "+234" },
  { code: "KE", flag: "🇰🇪", name: "Kenya",          dial: "+254" },
  { code: "GH", flag: "🇬🇭", name: "Ghana",          dial: "+233" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa",   dial: "+27"  },
  { code: "ET", flag: "🇪🇹", name: "Ethiopia",       dial: "+251" },
  { code: "TZ", flag: "🇹🇿", name: "Tanzania",       dial: "+255" },
  { code: "UG", flag: "🇺🇬", name: "Uganda",         dial: "+256" },
  { code: "EG", flag: "🇪🇬", name: "Egypt",          dial: "+20"  },
  { code: "SN", flag: "🇸🇳", name: "Senegal",        dial: "+221" },
  { code: "CM", flag: "🇨🇲", name: "Cameroon",       dial: "+237" },
  { code: "CI", flag: "🇨🇮", name: "Côte d'Ivoire",  dial: "+225" },
  { code: "RW", flag: "🇷🇼", name: "Rwanda",         dial: "+250" },
  { code: "ZW", flag: "🇿🇼", name: "Zimbabwe",       dial: "+263" },
  { code: "ZM", flag: "🇿🇲", name: "Zambia",         dial: "+260" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom", dial: "+44"  },
  { code: "US", flag: "🇺🇸", name: "United States",  dial: "+1"   },
  { code: "FR", flag: "🇫🇷", name: "France",         dial: "+33"  },
  { code: "PT", flag: "🇵🇹", name: "Portugal",       dial: "+351" },
];

/* ─── rate-limit helpers ────────────────────────────────────────────── */
const SEND_KEY = "loop.otp.lastSend";
const SEND_COUNT_KEY = "loop.otp.sendCount";
const MIN_SEND_INTERVAL_MS = 30_000;
const MAX_SENDS_PER_HOUR = 5;

function canSendNow(): { ok: boolean; waitMs: number } {
  const now = Date.now();
  const last = Number(localStorage.getItem(SEND_KEY) ?? 0);
  const delta = now - last;
  if (delta < MIN_SEND_INTERVAL_MS) return { ok: false, waitMs: MIN_SEND_INTERVAL_MS - delta };
  const window1h = JSON.parse(localStorage.getItem(SEND_COUNT_KEY) ?? "[]") as number[];
  const fresh = window1h.filter((t) => now - t < 3_600_000);
  if (fresh.length >= MAX_SENDS_PER_HOUR) return { ok: false, waitMs: 3_600_000 - (now - fresh[0]) };
  return { ok: true, waitMs: 0 };
}
function recordSend() {
  const now = Date.now();
  localStorage.setItem(SEND_KEY, String(now));
  const window1h = JSON.parse(localStorage.getItem(SEND_COUNT_KEY) ?? "[]") as number[];
  const fresh = window1h.filter((t) => now - t < 3_600_000);
  fresh.push(now);
  localStorage.setItem(SEND_COUNT_KEY, JSON.stringify(fresh));
}

/* ─── CountryPicker ─────────────────────────────────────────────────── */
function CountryPicker({ selected, onSelect }: { selected: Country; onSelect: (c: Country) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.dial.includes(query) ||
      c.code.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className={cn(
          "flex h-14 items-center gap-2 rounded-2xl border bg-surface px-3 transition-all",
          open ? "border-primary ring-1 ring-primary/30" : "border-border",
        )}
      >
        <span className="text-2xl leading-none">{selected.flag}</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{selected.dial}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => { onSelect(c); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface",
                    selected.code === c.code && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="text-xl">{c.flag}</span>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.dial}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── OTP digit boxes ───────────────────────────────────────────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!value[i] && i > 0) {
        refs[i - 1].current?.focus();
        onChange(value.slice(0, i - 1));
      } else {
        onChange(value.slice(0, i) + value.slice(i + 1));
      }
    }
  };

  const handleChange = (i: number, char: string) => {
    const digit = char.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const arr = value.split("");
    arr[i] = digit;
    onChange(arr.join("").slice(0, 6));
    if (i < 5) refs[i + 1].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    const nextEmpty = Math.min(pasted.length, 5);
    refs[nextEmpty].current?.focus();
    e.preventDefault();
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-14 w-11 rounded-2xl border bg-surface text-center font-mono text-xl font-bold outline-none transition-all caret-transparent",
            value[i]
              ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_color-mix(in_oklab,var(--sungold)_35%,transparent)]"
              : "border-border text-foreground",
            "focus:border-primary focus:ring-1 focus:ring-primary/30",
          )}
        />
      ))}
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────────────────── */
export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [local, setLocal] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const e164 = `${country.dial}${local.replace(/^0+/, "")}`;
  const phoneValid = /^\d{5,13}$/.test(local.replace(/\s/g, ""));

  useEffect(() => {
    if (!loading && user) navigate("/");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    if (code.length === 6) void verifyOtp();
  }, [code]);

  /* ── send OTP via Worker → Termii ──────────────────────────────── */
  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!phoneValid) { toast.error("Enter a valid local number"); return; }

    const gate = canSendNow();
    if (!gate.ok) {
      toast.error(`Wait ${Math.ceil(gate.waitMs / 1000)}s before requesting another code`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send code");
      recordSend();
      setStep("otp");
      setResendIn(30);
      toast.success("Code sent. Check your messages.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  /* ── verify OTP via Worker → Termii ────────────────────────────── */
  const verifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (code.length < 6) return;

    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164, token: code }),
      });
      const data = await res.json() as { ok?: boolean; access_token?: string; error?: string };
      if (!res.ok || !data.access_token) throw new Error(data.error ?? "Invalid or expired code");
      await setLoopToken(data.access_token);
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || busy) return;
    setCode("");
    await sendOtp();
  };

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-background">
      {/* African ambient background — warm gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/20 via-accent/5 to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 top-40 h-48 w-48 rounded-full bg-accent/10 blur-2xl" />

      {/* Adire-inspired top stripe */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-secondary opacity-80" />

      <div className="relative flex flex-1 flex-col px-6 py-10">
        {/* logo */}
        <div className="mb-10 flex items-center gap-2.5">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-sungold shadow-sungold">
            <Radio className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display text-2xl font-bold text-gradient-sungold">Loop</span>
        </div>

        {/* ── phone step ───────────────────────────────────────── */}
        {step === "phone" && (
          <div className="flex flex-1 flex-col">
            <h1 className="font-display text-[2rem] font-bold leading-[1.1]">
              Your number.<br />
              <span className="text-gradient-sungold">Your loop.</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              We'll send a 6-digit code.{" "}
              <span className="text-foreground/70">No password. No email.</span>
            </p>

            <form onSubmit={sendOtp} className="mt-8 space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Phone number
                </p>
                <div className="flex gap-2">
                  <CountryPicker selected={country} onSelect={setCountry} />
                  <div className="relative flex-1">
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={local}
                      onChange={(e) => setLocal(e.target.value.replace(/[^\d\s]/g, ""))}
                      placeholder="801 234 5678"
                      className={cn(
                        "h-14 w-full rounded-2xl border bg-surface px-4 text-lg font-medium tracking-wide outline-none transition-all",
                        local && !phoneValid
                          ? "border-destructive/60 focus:border-destructive"
                          : "border-border focus:border-primary focus:ring-1 focus:ring-primary/30",
                      )}
                    />
                    {local && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground/60">
                        {e164}
                      </span>
                    )}
                  </div>
                </div>
                <p className="pl-1 text-[11px] text-muted-foreground">
                  Enter your local number — we'll add{" "}
                  <span className="font-mono font-medium text-foreground/60">{country.dial}</span> automatically
                </p>
              </div>

              <button
                type="submit"
                disabled={busy || !phoneValid}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-sungold text-base font-semibold text-primary-foreground shadow-sungold transition-opacity disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send code →"}
              </button>
            </form>

            {/* quick-select African countries */}
            <div className="mt-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick select</p>
              <div className="flex flex-wrap gap-1.5">
                {COUNTRIES.slice(0, 9).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCountry(c)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all",
                      country.code === c.code
                        ? "border-primary bg-primary/15 font-semibold text-primary"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span>{c.flag}</span>
                    <span>{c.dial}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">
              By continuing you agree to our community rules. SMS rates may apply.
            </p>
          </div>
        )}

        {/* ── OTP step ─────────────────────────────────────────── */}
        {step === "otp" && (
          <div className="flex flex-1 flex-col">
            <button
              type="button"
              onClick={() => { setStep("phone"); setCode(""); }}
              className="-ml-1 mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Change number
            </button>

            <h1 className="font-display text-[2rem] font-bold leading-[1.1]">
              Enter your<br />
              <span className="text-gradient-sungold">6-digit code</span>
            </h1>

            <p className="mt-3 text-sm text-muted-foreground">
              Sent to <span className="font-medium text-foreground">{country.flag} {e164}</span>
            </p>

            <form onSubmit={verifyOtp} className="mt-10 space-y-6">
              <OtpInput value={code} onChange={setCode} />

              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-sungold text-base font-semibold text-primary-foreground shadow-sungold transition-opacity disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Verify & continue →"}
              </button>
            </form>

            <button
              type="button"
              onClick={resend}
              disabled={resendIn > 0 || busy}
              className={cn(
                "mt-6 w-full text-center text-sm transition-colors",
                resendIn > 0 || busy
                  ? "cursor-default text-muted-foreground/50"
                  : "text-primary hover:underline",
              )}
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
