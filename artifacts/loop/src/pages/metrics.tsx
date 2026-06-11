/**
 * Loop — Operator Metrics Dashboard
 *
 * OBSERVABILITY-002 (2026-06-11): Live metrics dashboard for operators.
 *   Reads from the 4 /api/metrics/* endpoints already shipped in the Loop
 *   Cloudflare Worker (OBSERVABILITY-001, 2026-06-10).
 *
 *   Sections:
 *     Overview  — live rooms, created today, new users, session starts
 *     Audience  — DAU / WAU / MAU / stickiness
 *     Auth      — logins, registrations, OTP sent/verified, success rate
 *     Retention — D1 / D7 retention %, new users D1/D7
 *     Rooms     — timeline chart (7-day created vs joined)
 *
 *   Auto-refreshes every 60 s. Manual refresh button in header.
 *   Restricted to authenticated users (same ProtectedRoute as all pages).
 *   In production, restrict to operator role on the API side.
 *
 * LILCKY STUDIO LIMITED
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "@/lib/api-fetch";
import { AppShell } from "@/components/layout/app-shell";
import {
  ChevronLeft, RefreshCw, Activity, Users, Radio,
  TrendingUp, ShieldCheck, BarChart2, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const REFRESH_INTERVAL_MS = 60_000;

/* ── API types ────────────────────────────────────────────────────────── */
interface OverviewData {
  timestamp: string;
  rooms:   { live_now: number | null; created_today: number | null; created_7d: number | null };
  users:   { total: number | null; new_today: number | null };
  sessions:{ started_today: number | null };
}
interface RetentionData {
  timestamp:        string;
  dau:              number | null;
  wau:              number | null;
  mau:              number | null;
  new_users_d1:     number | null;
  new_users_d7:     number | null;
  d1_retention_pct: number | null;
  d7_retention_pct: number | null;
  stickiness_pct:   number | null;
}
interface AuthData {
  period:              string;
  logins_24h:          number | null;
  registrations_24h:   number | null;
  otp_sent_24h:        number | null;
  otp_verified_24h:    number | null;
  otp_success_rate_pct:number | null;
}
interface TimelineRow { date: string; created: number; joined: number }
interface RoomsData {
  period_days:       number;
  total_created:     number;
  total_joined:      number;
  avg_joins_per_room:number;
  timeline:          TimelineRow[];
  by_category:       Record<string, number>;
}

/* ── Stat card ────────────────────────────────────────────────────────── */
function StatCard({
  label, value, sub, accent = false, large = false,
}: {
  label: string;
  value: string | number | null;
  sub?: string;
  accent?: boolean;
  large?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col gap-1 rounded-2xl border p-4",
      accent
        ? "border-primary/25 bg-primary/6"
        : "border-border bg-surface",
    )}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "font-display font-extrabold leading-none",
        large ? "text-4xl" : "text-2xl",
        value === null ? "text-muted-foreground/40" : accent ? "text-primary" : "text-foreground",
      )}>
        {value === null ? "—" : value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Section header ───────────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</h2>
    </div>
  );
}

/* ── Mini bar chart for timeline ──────────────────────────────────────── */
function MiniBarChart({ rows }: { rows: TimelineRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-6">No data yet</p>;
  const maxVal = Math.max(...rows.flatMap(r => [r.created, r.joined]), 1);
  return (
    <div className="mt-3 space-y-1.5">
      {rows.slice(-7).map((r) => (
        <div key={r.date} className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-16 shrink-0 font-mono">{r.date.slice(5)}</span>
          <div className="flex-1 flex flex-col gap-0.5">
            <div
              className="h-2 rounded-full bg-primary/70 transition-all"
              style={{ width: `${Math.round((r.created / maxVal) * 100)}%`, minWidth: r.created ? '4px' : 0 }}
            />
            <div
              className="h-2 rounded-full bg-primary/30 transition-all"
              style={{ width: `${Math.round((r.joined / maxVal) * 100)}%`, minWidth: r.joined ? '4px' : 0 }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-12 text-right font-mono shrink-0">
            {r.created}c / {r.joined}j
          </span>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2 pl-[72px]">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-2 w-3 rounded-full bg-primary/70 inline-block" />Created
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-2 w-3 rounded-full bg-primary/30 inline-block" />Joined
        </span>
      </div>
    </div>
  );
}

/* ── Category breakdown ───────────────────────────────────────────────── */
function CategoryBreakdown({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="space-y-2 mt-3">
      {entries.map(([cat, count]) => (
        <div key={cat} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground capitalize min-w-[80px] shrink-0">{cat || "general"}</span>
          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${Math.round((count / total) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold w-6 text-right shrink-0">{count}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Error state ──────────────────────────────────────────────────────── */
function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-destructive">Failed to load metrics</p>
        <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
        <button onClick={onRetry} className="mt-3 text-xs font-semibold text-primary underline underline-offset-2">
          Try again
        </button>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function MetricsPage() {
  const navigate = useNavigate();

  const [overview,  setOverview]  = useState<OverviewData  | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [auth,      setAuth]      = useState<AuthData      | null>(null);
  const [rooms,     setRooms]     = useState<RoomsData     | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [ovRes, retRes, authRes, roomsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/metrics/overview`),
        authFetch(`${API_BASE}/api/metrics/retention`),
        authFetch(`${API_BASE}/api/metrics/auth`),
        authFetch(`${API_BASE}/api/metrics/rooms?days=7`),
      ]);
      if (!ovRes.ok || !retRes.ok || !authRes.ok || !roomsRes.ok) {
        throw new Error("One or more metric endpoints returned an error");
      }
      const [ov, ret, au, rm] = await Promise.all([
        ovRes.json()   as Promise<OverviewData>,
        retRes.json()  as Promise<RetentionData>,
        authRes.json() as Promise<AuthData>,
        roomsRes.json()as Promise<RoomsData>,
      ]);
      setOverview(ov);
      setRetention(ret);
      setAuth(au);
      setRooms(rm);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(() => void load(true), REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const pct = (v: number | null) => v === null ? null : `${v}%`;
  const num = (v: number | null) => v === null ? null : v.toLocaleString();

  return (
    <AppShell>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border pt-safe-top">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg font-bold">Metrics</h1>
            {lastFetch && (
              <p className="text-[11px] text-muted-foreground">
                Updated {lastFetch.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0 active:scale-95 transition-transform disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="px-5 py-6 space-y-8 pb-safe-bottom">
        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Loading metrics…</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <ErrorCard message={error} onRetry={() => void load()} />
        )}

        {/* ── Overview ── */}
        {!loading && !error && overview && (
          <section>
            <SectionHeader icon={Radio} label="Live Overview" />
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Live rooms"
                value={num(overview.rooms.live_now)}
                sub="right now"
                accent
                large
              />
              <StatCard
                label="Created today"
                value={num(overview.rooms.created_today)}
                sub="rooms"
              />
              <StatCard
                label="New users today"
                value={num(overview.users.new_today)}
                sub="registered"
              />
              <StatCard
                label="Sessions today"
                value={num(overview.sessions.started_today)}
                sub="session starts"
              />
              <StatCard
                label="Total users"
                value={num(overview.users.total)}
                sub="all time"
              />
              <StatCard
                label="Rooms (7 days)"
                value={num(overview.rooms.created_7d)}
                sub="created"
              />
            </div>
          </section>
        )}

        {/* ── Audience ── */}
        {!loading && !error && retention && (
          <section>
            <SectionHeader icon={Users} label="Audience" />
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="DAU" value={num(retention.dau)} sub="daily active" accent />
              <StatCard label="WAU" value={num(retention.wau)} sub="weekly active" />
              <StatCard label="MAU" value={num(retention.mau)} sub="monthly active" />
            </div>
            {retention.stickiness_pct !== null && (
              <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stickiness (DAU/MAU)</p>
                  <p className="font-display text-lg font-bold text-primary">{retention.stickiness_pct}%</p>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(retention.stickiness_pct, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Industry benchmark: 10–25% for social apps
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Auth ── */}
        {!loading && !error && auth && (
          <section>
            <SectionHeader icon={ShieldCheck} label="Auth (Last 24h)" />
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Logins" value={num(auth.logins_24h)} />
              <StatCard label="Registrations" value={num(auth.registrations_24h)} />
              <StatCard label="OTP sent" value={num(auth.otp_sent_24h)} />
              <StatCard label="OTP verified" value={num(auth.otp_verified_24h)} />
            </div>
            {auth.otp_success_rate_pct !== null && (
              <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">OTP Success Rate</p>
                  <p className={cn(
                    "font-display text-lg font-bold",
                    auth.otp_success_rate_pct >= 90 ? "text-green-500"
                      : auth.otp_success_rate_pct >= 70 ? "text-amber-500"
                      : "text-destructive",
                  )}>
                    {auth.otp_success_rate_pct}%
                  </p>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      auth.otp_success_rate_pct >= 90 ? "bg-green-500"
                        : auth.otp_success_rate_pct >= 70 ? "bg-amber-500"
                        : "bg-destructive",
                    )}
                    style={{ width: `${Math.min(auth.otp_success_rate_pct, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Target: ≥ 90% · Below 70% → investigate SMS delivery
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Retention ── */}
        {!loading && !error && retention && (
          <section>
            <SectionHeader icon={TrendingUp} label="Retention" />
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                "flex flex-col gap-1 rounded-2xl border p-4",
                (retention.d1_retention_pct ?? 0) >= 40
                  ? "border-green-500/25 bg-green-500/5"
                  : "border-border bg-surface",
              )}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">D1 Retention</p>
                <p className={cn(
                  "font-display text-3xl font-extrabold",
                  retention.d1_retention_pct === null ? "text-muted-foreground/40"
                    : (retention.d1_retention_pct >= 40) ? "text-green-500"
                    : (retention.d1_retention_pct >= 20) ? "text-amber-500"
                    : "text-destructive",
                )}>
                  {pct(retention.d1_retention_pct) ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">Users who return next day</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Target: ≥ 40%</p>
              </div>
              <div className={cn(
                "flex flex-col gap-1 rounded-2xl border p-4",
                (retention.d7_retention_pct ?? 0) >= 20
                  ? "border-green-500/25 bg-green-500/5"
                  : "border-border bg-surface",
              )}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">D7 Retention</p>
                <p className={cn(
                  "font-display text-3xl font-extrabold",
                  retention.d7_retention_pct === null ? "text-muted-foreground/40"
                    : (retention.d7_retention_pct >= 20) ? "text-green-500"
                    : (retention.d7_retention_pct >= 10) ? "text-amber-500"
                    : "text-destructive",
                )}>
                  {pct(retention.d7_retention_pct) ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">Return within 7 days</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Target: ≥ 20%</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Room timeline (7d) ── */}
        {!loading && !error && rooms && (
          <section>
            <SectionHeader icon={BarChart2} label={`Rooms — Last ${rooms.period_days} Days`} />
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="font-display text-2xl font-extrabold">{rooms.total_created.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">rooms created</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-2xl font-extrabold">{rooms.total_joined.toLocaleString()}</p>
                  <p className="text-[11px] text-muted-foreground">joins</p>
                </div>
                <div className="text-center">
                  <p className="font-display text-2xl font-extrabold">{rooms.avg_joins_per_room.toFixed(1)}</p>
                  <p className="text-[11px] text-muted-foreground">avg joins/room</p>
                </div>
              </div>
              <MiniBarChart rows={rooms.timeline} />
            </div>

            {Object.keys(rooms.by_category).length > 0 && (
              <div className="mt-3 rounded-2xl border border-border bg-surface p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">By Category</p>
                <CategoryBreakdown data={rooms.by_category} />
              </div>
            )}
          </section>
        )}

        {/* ── Footer ── */}
        {!loading && !error && (
          <p className="text-center text-[11px] text-muted-foreground pb-4">
            Auto-refreshes every 60 s · LILCKY STUDIO LIMITED
          </p>
        )}
      </div>
    </AppShell>
  );
}
