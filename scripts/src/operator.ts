#!/usr/bin/env tsx
/**
 * operator — Loop operator-access CLI
 * OPERATOR-001 (2026-06-11)
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run operator grant   <username-or-uuid>
 *   pnpm --filter @workspace/scripts run operator revoke  <username-or-uuid>
 *   pnpm --filter @workspace/scripts run operator status  <username-or-uuid>
 *   pnpm --filter @workspace/scripts run operator list
 *
 * Env vars required (use .env or wrangler secrets):
 *   SUPABASE_URL              — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 *
 * LILCKY STUDIO LIMITED
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const BASE = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Accept:        "application/json",
  Prefer:        "return=representation",
};

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile {
  id:           string;
  username:     string | null;
  display_name: string | null;
  is_operator:  boolean;
  created_at:   string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function sb(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...HEADERS, ...(init?.headers as object ?? {}) } });
  return res;
}

async function findProfile(lookup: string): Promise<Profile | null> {
  const filter = isUuid(lookup)
    ? `id=eq.${encodeURIComponent(lookup)}`
    : `username=eq.${encodeURIComponent(lookup)}`;

  const res  = await sb(`/profiles?${filter}&select=id,username,display_name,is_operator,created_at&limit=1`);
  if (!res.ok) { console.error(`✗ Supabase error ${res.status}: ${await res.text()}`); process.exit(1); }
  const rows = await res.json() as Profile[];
  return rows[0] ?? null;
}

function label(p: Profile): string {
  const name = p.display_name ?? p.username ?? p.id;
  const user = p.username ? `@${p.username}` : p.id;
  return `${name} (${user})`;
}

function badge(p: Profile): string {
  return p.is_operator ? "✓ operator" : "  user";
}

// ── Commands ───────────────────────────────────────────────────────────────

async function cmdGrant(lookup: string): Promise<void> {
  const profile = await findProfile(lookup);
  if (!profile) { console.error(`✗ No profile found for "${lookup}".`); process.exit(1); }
  if (profile.is_operator) {
    console.log(`ℹ  ${label(profile)} is already an operator. No change.`);
    return;
  }

  const res = await sb(
    `/profiles?id=eq.${encodeURIComponent(profile.id)}`,
    { method: "PATCH", body: JSON.stringify({ is_operator: true }) },
  );
  if (!res.ok) { console.error(`✗ Update failed ${res.status}: ${await res.text()}`); process.exit(1); }

  console.log(`✓ Granted operator access to ${label(profile)}.`);
  console.log(`  Note: KV cache clears within 5 min — access is immediate on next request.`);
}

async function cmdRevoke(lookup: string): Promise<void> {
  const profile = await findProfile(lookup);
  if (!profile) { console.error(`✗ No profile found for "${lookup}".`); process.exit(1); }
  if (!profile.is_operator) {
    console.log(`ℹ  ${label(profile)} is not an operator. No change.`);
    return;
  }

  const res = await sb(
    `/profiles?id=eq.${encodeURIComponent(profile.id)}`,
    { method: "PATCH", body: JSON.stringify({ is_operator: false }) },
  );
  if (!res.ok) { console.error(`✗ Update failed ${res.status}: ${await res.text()}`); process.exit(1); }

  console.log(`✓ Revoked operator access from ${label(profile)}.`);
  console.log(`  Note: KV cache clears within 5 min — revocation is enforced on the next request after that.`);
}

async function cmdStatus(lookup: string): Promise<void> {
  const profile = await findProfile(lookup);
  if (!profile) { console.error(`✗ No profile found for "${lookup}".`); process.exit(1); }
  console.log(`${badge(profile)}  ${label(profile)}`);
  console.log(`  id:         ${profile.id}`);
  console.log(`  username:   ${profile.username ?? "(none)"}`);
  console.log(`  created_at: ${profile.created_at}`);
}

async function cmdList(): Promise<void> {
  const res = await sb(
    `/profiles?is_operator=eq.true&select=id,username,display_name,is_operator,created_at&order=created_at.asc`,
  );
  if (!res.ok) { console.error(`✗ Supabase error ${res.status}: ${await res.text()}`); process.exit(1); }
  const rows = await res.json() as Profile[];

  if (rows.length === 0) {
    console.log("ℹ  No operators found. Grant access with:");
    console.log("   pnpm --filter @workspace/scripts run operator grant <username-or-uuid>");
    return;
  }

  console.log(`Operators (${rows.length}):\n`);
  for (const p of rows) {
    console.log(`  ✓  ${label(p)}`);
    console.log(`     id: ${p.id}   joined: ${p.created_at.slice(0, 10)}`);
  }
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

const [, , cmd, arg] = process.argv;

const USAGE = `
Loop operator CLI — OPERATOR-001

  grant  <username|uuid>   Grant operator access
  revoke <username|uuid>   Revoke operator access
  status <username|uuid>   Check a user's operator status
  list                     List all current operators

Example:
  pnpm --filter @workspace/scripts run operator grant  alice
  pnpm --filter @workspace/scripts run operator revoke 3f2a1c...
  pnpm --filter @workspace/scripts run operator list
`.trim();

switch (cmd) {
  case "grant":
    if (!arg) { console.error("✗ Usage: operator grant <username-or-uuid>"); process.exit(1); }
    await cmdGrant(arg);
    break;
  case "revoke":
    if (!arg) { console.error("✗ Usage: operator revoke <username-or-uuid>"); process.exit(1); }
    await cmdRevoke(arg);
    break;
  case "status":
    if (!arg) { console.error("✗ Usage: operator status <username-or-uuid>"); process.exit(1); }
    await cmdStatus(arg);
    break;
  case "list":
    await cmdList();
    break;
  default:
    console.log(USAGE);
    process.exit(cmd ? 1 : 0);
}
