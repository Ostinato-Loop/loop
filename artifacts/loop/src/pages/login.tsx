import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useAuth, setLoopToken } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Loader2, ArrowLeft, ChevronDown, Search, LogIn, UserPlus, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/* ─── types ──────────────────────────────────────────────────────────── */
type Tab      = "signin" | "signup" | "forgot";
type Step     = "phone"  | "otp";
type BoxState = "idle" | "typing" | "loading" | "success" | "error";
type Country  = { code: string; flag: string; name: string; dial: string };

/* ─── countries ──────────────────────────────────────────────────────── */
const COUNTRIES: Country[] = [
  { code: "NG", flag: "🇳🇬", name: "Nigeria",           dial: "+234" },
  { code: "KE", flag: "🇰🇪", name: "Kenya",             dial: "+254" },
  { code: "GH", flag: "🇬🇭", name: "Ghana",             dial: "+233" },
  { code: "ZA", flag: "🇿🇦", name: "South Africa",      dial: "+27"  },
  { code: "ET", flag: "🇪🇹", name: "Ethiopia",          dial: "+251" },
  { code: "TZ", flag: "🇹🇿", name: "Tanzania",          dial: "+255" },
  { code: "UG", flag: "🇺🇬", name: "Uganda",            dial: "+256" },
  { code: "RW", flag: "🇷🇼", name: "Rwanda",            dial: "+250" },
  { code: "SN", flag: "🇸🇳", name: "Senegal",           dial: "+221" },
  { code: "CI", flag: "🇨🇮", name: "Côte d'Ivoire",     dial: "+225" },
  { code: "CM", flag: "🇨🇲", name: "Cameroon",          dial: "+237" },
  { code: "EG", flag: "🇪🇬", name: "Egypt",             dial: "+20"  },
  { code: "MA", flag: "🇲🇦", name: "Morocco",           dial: "+212" },
  { code: "TN", flag: "🇹🇳", name: "Tunisia",           dial: "+216" },
  { code: "ZW", flag: "🇿🇼", name: "Zimbabwe",          dial: "+263" },
  { code: "ZM", flag: "🇿🇲", name: "Zambia",            dial: "+260" },
  { code: "AO", flag: "🇦🇴", name: "Angola",            dial: "+244" },
  { code: "MZ", flag: "🇲🇿", name: "Mozambique",        dial: "+258" },
  { code: "MG", flag: "🇲🇬", name: "Madagascar",        dial: "+261" },
  { code: "CD", flag: "🇨🇩", name: "DR Congo",          dial: "+243" },
  { code: "BW", flag: "🇧🇼", name: "Botswana",          dial: "+267" },
  { code: "NA", flag: "🇳🇦", name: "Namibia",           dial: "+264" },
  { code: "SS", flag: "🇸🇸", name: "South Sudan",       dial: "+211" },
  { code: "SO", flag: "🇸🇴", name: "Somalia",           dial: "+252" },
  { code: "ML", flag: "🇲🇱", name: "Mali",              dial: "+223" },
  { code: "BF", flag: "🇧🇫", name: "Burkina Faso",      dial: "+226" },
  { code: "NE", flag: "🇳🇪", name: "Niger",             dial: "+227" },
  { code: "TD", flag: "🇹🇩", name: "Chad",              dial: "+235" },
  { code: "GM", flag: "🇬🇲", name: "Gambia",            dial: "+220" },
  { code: "SL", flag: "🇸🇱", name: "Sierra Leone",      dial: "+232" },
  { code: "LR", flag: "🇱🇷", name: "Liberia",           dial: "+231" },
  { code: "MU", flag: "🇲🇺", name: "Mauritius",         dial: "+230" },
  { code: "GB", flag: "🇬🇧", name: "United Kingdom",    dial: "+44"  },
  { code: "US", flag: "🇺🇸", name: "United States",     dial: "+1"   },
];

/* ─── per-state glow (box-shadow that wraps all four sides) ──────────── */
const GLOW: Record<BoxState, React.CSSProperties> = {
  idle: {
    boxShadow:
      "0 0 0 1.5px oklch(0.72 0.18 48 / 0.20)," +
      "inset 0 1px 0 oklch(1 0 0 / 0.05)," +
      "0 28px 70px oklch(0 0 0 / 0.75)",
  },
  typing: {
    boxShadow:
      "0 0 0 2.5px oklch(0.88 0.22 88)," +
      "0 0 0 6px  oklch(0.88 0.22 88 / 0.14)," +
      "0 0 55px   oklch(0.88 0.22 88 / 0.42)," +
      "inset 0 1px 0 oklch(1 0 0 / 0.08)," +
      "0 28px 70px oklch(0 0 0 / 0.6)",
  },
  loading: {
    boxShadow:
      "0 0 0 2px oklch(0.72 0.18 48 / 0.75)," +
      "0 0 0 5px oklch(0.72 0.18 48 / 0.12)," +
      "0 0 40px oklch(0.72 0.18 48 / 0.35)," +
      "inset 0 1px 0 oklch(1 0 0 / 0.07)," +
      "0 28px 70px oklch(0 0 0 / 0.65)",
  },
  success: {
    boxShadow:
      "0 0 0 3px oklch(0.65 0.18 155)," +
      "0 0 0 7px oklch(0.65 0.18 155 / 0.18)," +
      "0 0 70px oklch(0.65 0.18 155 / 0.58)," +
      "inset 0 1px 0 oklch(1 0 0 / 0.1)," +
      "0 28px 70px oklch(0 0 0 / 0.5)",
  },
  error: {
    boxShadow:
      "0 0 0 3px oklch(0.60 0.24 20)," +
      "0 0 0 7px oklch(0.60 0.24 20 / 0.18)," +
      "0 0 65px oklch(0.60 0.24 20 / 0.52)," +
      "inset 0 1px 0 oklch(1 0 0 / 0.08)," +
      "0 28px 70px oklch(0 0 0 / 0.6)",
  },
};

/* ─── rate-limit helpers ─────────────────────────────────────────────── */
const SEND_KEY       = "loop.otp.lastSend";
const SEND_COUNT_KEY = "loop.otp.sendCount";
function canSendNow(): { ok: boolean; waitMs: number } {
  const now  = Date.now();
  const last = Number(localStorage.getItem(SEND_KEY) ?? 0);
  if (now - last < 30_000) return { ok: false, waitMs: 30_000 - (now - last) };
  const arr = (JSON.parse(localStorage.getItem(SEND_COUNT_KEY) ?? "[]") as number[])
    .filter((t) => now - t < 3_600_000);
  if (arr.length >= 5) return { ok: false, waitMs: 3_600_000 - (now - arr[0]) };
  return { ok: true, waitMs: 0 };
}
function recordSend() {
  const now = Date.now();
  localStorage.setItem(SEND_KEY, String(now));
  const arr = (JSON.parse(localStorage.getItem(SEND_COUNT_KEY) ?? "[]") as number[])
    .filter((t) => now - t < 3_600_000);
  arr.push(now);
  localStorage.setItem(SEND_COUNT_KEY, JSON.stringify(arr));
}

/* ─── CountryPicker ──────────────────────────────────────────────────── */
function CountryPicker({ selected, onSelect, onFocus, onBlur }: {
  selected: Country; onSelect: (c: Country) => void;
  onFocus?: () => void; onBlur?: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); onBlur?.(); }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onBlur]);
  const filtered = COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(query.toLowerCase()) ||
           c.dial.includes(query) || c.code.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); onFocus?.(); }}
        className={cn(
          "flex h-12 items-center gap-2 rounded-xl border bg-white/5 px-3 transition-all",
          open ? "border-primary/50" : "border-white/10 hover:border-white/20",
        )}
      >
        <span className="text-xl leading-none">{selected.flag}</span>
        <span className="font-mono text-sm font-semibold text-foreground">{selected.dial}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[oklch(0.18_0.03_50)] shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country or code…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50" />
            </div>
            <ul className="max-h-52 overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.code}>
                  <button type="button" onClick={() => { onSelect(c); setOpen(false); onBlur?.(); }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5",
                      selected.code === c.code && "bg-primary/10 text-primary",
                    )}
                  >
                    <span className="text-lg">{c.flag}</span>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{c.dial}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">No results</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── OtpInput ───────────────────────────────────────────────────────── */
function OtpInput({ value, onChange, onFocus, onBlur, disabled }: {
  value: string; onChange: (v: string) => void;
  onFocus?: () => void; onBlur?: () => void; disabled?: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!value[i] && i > 0) { inputRefs.current[i - 1]?.focus(); onChange(value.slice(0, i - 1)); }
      else onChange(value.slice(0, i) + value.slice(i + 1));
    } else if (e.key === "ArrowLeft"  && i > 0) inputRefs.current[i - 1]?.focus();
    else if   (e.key === "ArrowRight" && i < 5) inputRefs.current[i + 1]?.focus();
  };
  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    const arr = (value + "      ").slice(0, 6).split("");
    arr[i] = digit;
    onChange(arr.join("").trimEnd());
    if (i < 5) inputRefs.current[i + 1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    e.preventDefault();
  };
  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: 6 }, (_, i) => (
        <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={value[i] ?? ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => { e.target.select(); onFocus?.(); }}
          onBlur={onBlur}
          className={cn(
            "h-14 w-11 rounded-xl border bg-white/5 text-center font-mono text-xl font-bold",
            "outline-none transition-all duration-200 caret-transparent",
            value[i]
              ? "border-primary/70 text-primary shadow-[0_0_14px_oklch(0.72_0.18_48_/_0.38)]"
              : "border-white/10 text-foreground focus:border-white/30",
            disabled && "cursor-not-allowed opacity-40",
          )}
        />
      ))}
    </div>
  );
}

/* ─── tabs config ────────────────────────────────────────────────────── */
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "signin", label: "Sign In", icon: <LogIn    className="h-3.5 w-3.5" /> },
  { id: "signup", label: "Sign Up", icon: <UserPlus className="h-3.5 w-3.5" /> },
  { id: "forgot", label: "Recover", icon: <KeyRound className="h-3.5 w-3.5" /> },
];

/* ─── heading copy per tab ───────────────────────────────────────────── */
const HEADING: Record<Tab, { title: string; accent: string; sub: string }> = {
  signin: { title: "Welcome",      accent: "back.",           sub: "Enter your number — we'll send a 6-digit code."   },
  signup: { title: "Join the",     accent: "conversation.",   sub: "Create your Loop account in seconds."             },
  forgot: { title: "Recover",      accent: "access.",         sub: "Enter your number and we'll send a fresh code."   },
};

/* ─── gradient text helper ───────────────────────────────────────────── */
const gradientText: React.CSSProperties = {
  backgroundImage: "linear-gradient(135deg, oklch(0.88 0.22 88), oklch(0.72 0.18 48))",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};

/* ═══════════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [tab,         setTab]         = useState<Tab>("signin");
  const [step,        setStep]        = useState<Step>("phone");
  const [boxState,    setBoxState]    = useState<BoxState>("idle");
  const [focusCount,  setFocusCount]  = useState(0);
  const [country,     setCountry]     = useState<Country>(COUNTRIES[0]);
  const [local,       setLocal]       = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code,        setCode]        = useState("");
  const [busy,        setBusy]        = useState(false);
  const [resendIn,    setResendIn]    = useState(0);
  const [errorMsg,    setErrorMsg]    = useState("");
  const [sentTo,      setSentTo]      = useState("");

  const e164       = `${country.dial}${local.replace(/^0+/, "")}`;
  const phoneValid = /^\d{5,13}$/.test(local.replace(/\s/g, ""));
  const nameValid  = tab !== "signup" || displayName.trim().length >= 2;

  /* effective box state — single source of truth */
  const effectiveBox = useMemo((): BoxState => {
    if (boxState === "success" || boxState === "error") return boxState;
    if (busy) return "loading";
    if (focusCount > 0) return "typing";
    return "idle";
  }, [boxState, busy, focusCount]);

  const onFocusIn  = useCallback(() => setFocusCount((n) => n + 1), []);
  const onFocusOut = useCallback(() => setFocusCount((n) => Math.max(0, n - 1)), []);

  const triggerError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setBoxState("error");
    setTimeout(() => { setBoxState("idle"); setErrorMsg(""); }, 2600);
  }, []);

  useEffect(() => { if (!loading && user) navigate("/"); }, [user, loading, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1_000);
    return () => clearInterval(t);
  }, [resendIn]);

  /* auto-verify at 6 digits */
  useEffect(() => {
    if (code.length === 6 && step === "otp" && !busy && boxState !== "success")
      void handleVerify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const switchTab = (t: Tab) => {
    setTab(t); setStep("phone"); setCode(""); setErrorMsg(""); setBoxState("idle");
  };

  /* ── send OTP ──────────────────────────────────────────────────────── */
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phoneValid)  return triggerError("Enter a valid phone number");
    if (!nameValid)   return triggerError("Enter your display name (2+ chars)");
    const gate = canSendNow();
    if (!gate.ok) return triggerError(`Wait ${Math.ceil(gate.waitMs / 1_000)}s before requesting another code`);

    setBusy(true); setErrorMsg("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164 }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not send code");
      recordSend();
      setSentTo(`${country.flag} ${e164}`);
      setStep("otp");
      setResendIn(30);
    } catch (err) {
      triggerError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  /* ── verify OTP ────────────────────────────────────────────────────── */
  async function handleVerify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length < 6) return;

    setBusy(true); setErrorMsg("");
    try {
      const res  = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: e164, token: code, mode: tab,
          displayName: tab === "signup" ? displayName.trim() : undefined,
        }),
      });
      const data = await res.json() as { access_token?: string; is_new_user?: boolean; error?: string };
      if (!res.ok || !data.access_token) throw new Error(data.error ?? "Invalid or expired code");

      setBoxState("success");
      await setLoopToken(data.access_token);
      setTimeout(() => { window.location.href = data.is_new_user ? "/onboarding" : "/"; }, 900);
    } catch (err) {
      triggerError(err instanceof Error ? err.message : "Invalid or expired code");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0 || busy) return;
    setCode(""); setStep("phone"); await handleSend();
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden"
         style={{ background: "oklch(0.11 0.025 50)" }}>

      {/* ambient warm-earth glow from below */}
      <div className="pointer-events-none absolute inset-0"
           style={{ background:
             "radial-gradient(ellipse 80% 55% at 50% 115%,oklch(0.72 0.18 48 / 0.17) 0%,transparent 60%)," +
             "radial-gradient(ellipse 50% 35% at 85% -5%, oklch(0.57 0.16 158 / 0.10) 0%,transparent 55%)" }} />

      {/* dot-grid texture */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.028]"
           style={{ backgroundImage: "radial-gradient(circle,oklch(0.9 0.05 48) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* kente stripe top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-accent to-terracotta opacity-75" />

      {/* ── the box ── */}
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative mx-4 w-full max-w-sm"
      >
        {/* shake on error */}
        <motion.div
          animate={effectiveBox === "error" ? { x: [0,-9,9,-7,7,-4,4,-2,2,0] } : { x: 0 }}
          transition={{ duration: 0.5 }}
        >

          {/* floating status badge */}
          <AnimatePresence>
            {(effectiveBox === "typing" || effectiveBox === "success" || effectiveBox === "error") && (
              <motion.div key={effectiveBox}
                initial={{ opacity: 0, y: -8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="absolute -top-4 left-1/2 z-10 -translate-x-1/2"
              >
                <span className="rounded-full px-3.5 py-1 text-[10px] font-black uppercase tracking-widest"
                  style={{
                    background: effectiveBox === "typing"  ? "oklch(0.88 0.22 88)"  :
                                effectiveBox === "success" ? "oklch(0.65 0.18 155)" :
                                                             "oklch(0.62 0.24 20)",
                    color:      "oklch(0.11 0.03 48)",
                    boxShadow:  effectiveBox === "typing"  ? "0 0 20px oklch(0.88 0.22 88 / 0.5)"  :
                                effectiveBox === "success" ? "0 0 20px oklch(0.65 0.18 155 / 0.55)" :
                                                             "0 0 20px oklch(0.62 0.24 20 / 0.5)",
                  }}
                >
                  {effectiveBox === "typing"  ? "Listening…"  :
                   effectiveBox === "success" ? "✓ Verified!"  :
                                               "Try again"}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* THE BOX CARD */}
          <div
            className="relative overflow-hidden rounded-3xl"
            style={{
              background: "oklch(0.165 0.028 50)",
              transition: "box-shadow 0.38s cubic-bezier(0.22,1,0.36,1)",
              ...GLOW[effectiveBox],
            }}
          >
            {/* inner shimmer line */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* success tint overlay */}
            <AnimatePresence>
              {effectiveBox === "success" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="pointer-events-none absolute inset-0 rounded-3xl"
                  style={{ background: "oklch(0.65 0.18 155 / 0.055)" }} />
              )}
            </AnimatePresence>

            <div className="px-7 pb-7 pt-6">

              {/* logo + brand badge */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl"
                       style={{ background: "linear-gradient(135deg,oklch(0.72 0.18 48),oklch(0.82 0.20 50))" }}>
                    <Radio className="h-[18px] w-[18px] text-[oklch(0.11_0.03_48)]" strokeWidth={2.5} />
                  </div>
                  <span className="font-display text-xl font-bold" style={gradientText}>Loop</span>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                  RALD Auth
                </span>
              </div>

              {/* tab bar */}
              <div className="mb-5 flex gap-1 rounded-xl bg-white/[0.04] p-1">
                {TABS.map((t) => (
                  <button key={t.id} type="button" onClick={() => switchTab(t.id)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold transition-all duration-200",
                      tab === t.id
                        ? "bg-primary text-[oklch(0.11_0.03_48)] shadow-[0_2px_14px_oklch(0.72_0.18_48_/_0.38)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {/* ═══ animated content ═══ */}
              <AnimatePresence mode="wait">
                {step === "phone" ? (

                  /* ── PHONE STEP ── */
                  <motion.div key={`phone-${tab}`}
                    initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.2 }}
                  >
                    {/* heading */}
                    <div className="mb-5">
                      <h1 className="font-display text-[1.65rem] font-bold leading-snug text-foreground">
                        {HEADING[tab].title}{" "}
                        <span style={gradientText}>{HEADING[tab].accent}</span>
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">{HEADING[tab].sub}</p>
                    </div>

                    <form onSubmit={handleSend} className="space-y-3">

                      {/* display name (sign-up only) */}
                      {tab === "signup" && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your name</label>
                          <input type="text" autoComplete="name" placeholder="e.g. Amara Osei"
                            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                            onFocus={onFocusIn} onBlur={onFocusOut}
                            className={cn(
                              "h-12 w-full rounded-xl border bg-white/5 px-4 text-sm text-foreground outline-none transition-all",
                              "placeholder:text-muted-foreground/40",
                              displayName.length > 0 && displayName.length < 2
                                ? "border-[oklch(0.60_0.24_20_/_0.55)]"
                                : "border-white/10 focus:border-white/25",
                            )} />
                        </div>
                      )}

                      {/* phone */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Phone number</label>
                        <div className="flex gap-2">
                          <CountryPicker selected={country} onSelect={setCountry} onFocus={onFocusIn} onBlur={onFocusOut} />
                          <div className="relative flex-1">
                            <input type="tel" inputMode="numeric" autoComplete="tel-national"
                              value={local}
                              onChange={(e) => setLocal(e.target.value.replace(/[^\d\s]/g, ""))}
                              onFocus={onFocusIn} onBlur={onFocusOut}
                              placeholder="801 234 5678"
                              className={cn(
                                "h-12 w-full rounded-xl border bg-white/5 px-4 text-sm font-medium text-foreground",
                                "outline-none transition-all placeholder:text-muted-foreground/40",
                                local && !phoneValid
                                  ? "border-[oklch(0.60_0.24_20_/_0.55)]"
                                  : "border-white/10 focus:border-white/25",
                              )} />
                            {local && (
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-foreground/45">
                                {e164}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground/50">
                          Local number — <span className="font-mono">{country.dial}</span> added automatically
                        </p>
                      </div>

                      {/* error */}
                      <AnimatePresence>
                        {errorMsg && (
                          <motion.p key="err"
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="rounded-xl bg-[oklch(0.60_0.24_20_/_0.13)] px-3 py-2.5 text-xs font-medium text-[oklch(0.78 0.15 20)]"
                          >{errorMsg}</motion.p>
                        )}
                      </AnimatePresence>

                      {/* submit */}
                      <button type="submit" disabled={busy || !phoneValid || !nameValid}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black tracking-wide transition-all disabled:opacity-40"
                        style={{
                          background: "linear-gradient(135deg,oklch(0.72 0.18 48),oklch(0.82 0.20 50))",
                          color: "oklch(0.11 0.03 48)",
                          boxShadow: "0 4px 22px oklch(0.72 0.18 48 / 0.42)",
                        }}
                      >
                        {busy
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : tab === "forgot" ? "Send recovery code →"
                          : tab === "signup" ? "Create account →"
                          : "Send code →"}
                      </button>
                    </form>

                    {/* quick flags */}
                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">Quick select</p>
                      <div className="flex flex-wrap gap-1.5">
                        {COUNTRIES.slice(0, 8).map((c) => (
                          <button key={c.code} type="button" onClick={() => setCountry(c)}
                            className={cn(
                              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all",
                              country.code === c.code
                                ? "border-primary/50 bg-primary/15 font-bold text-primary"
                                : "border-white/10 bg-white/3 text-muted-foreground hover:border-white/20 hover:text-foreground",
                            )}
                          >
                            <span>{c.flag}</span>
                            <span className="font-mono">{c.dial}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                ) : (

                  /* ── OTP STEP ── */
                  <motion.div key="otp"
                    initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.2 }}
                  >
                    <button type="button"
                      onClick={() => { setStep("phone"); setCode(""); setErrorMsg(""); setBoxState("idle"); }}
                      className="-ml-1 mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Change number
                    </button>

                    <div className="mb-5">
                      <h1 className="font-display text-2xl font-bold text-foreground">
                        Enter the <span style={gradientText}>6-digit code</span>
                      </h1>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        Sent to <span className="font-semibold text-foreground">{sentTo}</span>
                      </p>
                    </div>

                    <form onSubmit={handleVerify} className="space-y-4">
                      <OtpInput value={code} onChange={setCode} onFocus={onFocusIn} onBlur={onFocusOut}
                        disabled={busy || effectiveBox === "success"} />

                      <AnimatePresence>
                        {errorMsg && (
                          <motion.p key="err"
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="rounded-xl bg-[oklch(0.60_0.24_20_/_0.13)] px-3 py-2.5 text-center text-xs font-medium text-[oklch(0.78 0.15 20)]"
                          >{errorMsg}</motion.p>
                        )}
                      </AnimatePresence>

                      <button type="submit"
                        disabled={busy || code.length < 6 || effectiveBox === "success"}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black transition-all disabled:opacity-40"
                        style={{
                          background: effectiveBox === "success"
                            ? "linear-gradient(135deg,oklch(0.55 0.18 155),oklch(0.65 0.18 155))"
                            : "linear-gradient(135deg,oklch(0.72 0.18 48),oklch(0.82 0.20 50))",
                          color: "oklch(0.11 0.03 48)",
                          boxShadow: effectiveBox === "success"
                            ? "0 4px 22px oklch(0.65 0.18 155 / 0.5)"
                            : "0 4px 22px oklch(0.72 0.18 48 / 0.4)",
                        }}
                      >
                        {effectiveBox === "success" ? "✓ Verified! Entering…"
                          : busy ? <Loader2 className="h-4 w-4 animate-spin" />
                          : "Verify & continue →"}
                      </button>
                    </form>

                    <div className="mt-4 text-center">
                      <button type="button" onClick={handleResend} disabled={resendIn > 0 || busy}
                        className={cn("text-xs transition-colors",
                          resendIn > 0 || busy
                            ? "cursor-default text-muted-foreground/35"
                            : "text-primary underline-offset-2 hover:underline"
                        )}
                      >
                        {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

                        {/* RALD SSO */}
            <div className="relative mx-7 mb-2 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">or</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="px-7 pb-4">
              <a
                href="https://accounts.rald.cloud?redirect_to=https%3A%2F%2Floop.rald.cloud%2Flogin&app_id=loop"
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-muted-foreground transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground"
              >
                <span className="font-black" style={gradientText}>RALD</span>
                Sign in with RALD Profile
              </a>
            </div>
            {/* bottom bar */}
            <div className="border-t border-white/[0.06] px-7 py-3">
              <p className="text-center text-[10px] text-muted-foreground/35">
                Secured by{" "}
                <span className="font-black" style={gradientText}>RALD</span>
                {" "}· Powered by Termii · No password needed
              </p>
            </div>
          </div>
        </motion.div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground/25">
          By continuing you agree to Loop's community rules. SMS rates may apply.
        </p>
      </motion.div>
    </div>
  );
}
