// Loop API Server — Auth Routes
// Phase H: Identity Axiom — Loop does NOT own identity; it proxies RALD Auth.
//
// POST /api/auth/rald-sso  — exchange RALD JWT, bootstrap Loop session
// GET  /api/auth/me        — return current user + Loop profile from Supabase
// GET  /api/auth/silent    — validate rald_session cookie (no re-login)
//
// RALD JWT (HS256) is issued by auth.rald.cloud and accepted directly.
// Loop re-uses the master RALD token as its own session token — no re-signing.
// LILCKY STUDIO LIMITED

import { Router, type Request, type Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { verifyJwt } from "../lib/jwt";

const router = Router();

const RALD_JWT_SECRET         = process.env["RALD_JWT_SECRET"] ?? "";
const SUPABASE_URL            = process.env["SUPABASE_URL"] ?? "";
const SUPABASE_SERVICE_ROLE   = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

function db() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k?.trim() === name) return v.join("=").trim() || null;
  }
  return null;
}

async function lookupProfile(userId: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) return null;
  try {
    const { data } = await db()
      .from("profiles")
      .select(
        "id,username,display_name,avatar_url,bio,language,interests,is_creator,is_verified,onboarded",
      )
      .eq("id", userId)
      .maybeSingle();
    return data ?? null;
  } catch (e) {
    console.error("[loop-auth] profile lookup failed:", String(e));
    return null;
  }
}

// ── POST /api/auth/rald-sso ───────────────────────────────────────────────────
// Body:    { rald_token: string }
// Returns: { access_token: string }
//
// Validates the RALD master JWT and hands it back as the Loop access token.
// No DB write — identity is owned by auth.rald.cloud / profiles.rald.cloud.
router.post("/rald-sso", async (req: Request, res: Response) => {
  const { rald_token } = (req.body ?? {}) as { rald_token?: string };
  if (!rald_token) {
    res.status(400).json({ error: "rald_token is required" });
    return;
  }
  if (!RALD_JWT_SECRET) {
    res.status(503).json({ error: "Auth service not configured — RALD_JWT_SECRET missing" });
    return;
  }

  const payload = await verifyJwt(rald_token, RALD_JWT_SECRET);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired RALD token" });
    return;
  }

  // Optionally provision / sync the profile row in Supabase.
  // Non-blocking — failure must NOT block the SSO flow.
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
    db()
      .from("profiles")
      .upsert(
        { id: payload.id, updated_at: new Date().toISOString() },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .then(undefined, (e: unknown) =>
        console.warn("[loop-auth] profile sync failed (non-fatal):", String(e)),
      );
  }

  res.json({
    access_token: rald_token,
    user: {
      id:    payload.id,
      phone: payload.phone ?? payload.email ?? "",
      role:  payload.role ?? "user",
    },
    sso_version: payload.sso_v ?? 1,
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Header:  Authorization: Bearer <rald_token>
// Returns: { user: LoopUser, profile: Profile | null }
router.get("/me", async (req: Request, res: Response) => {
  const authHeader = (req.headers["authorization"] ?? "") as string;
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized — Bearer token required" });
    return;
  }
  if (!RALD_JWT_SECRET) {
    res.status(503).json({ error: "Auth service not configured" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, RALD_JWT_SECRET);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const profile = await lookupProfile(payload.id);

  res.json({
    user: {
      id:    payload.id,
      phone: payload.phone ?? payload.email ?? "",
      role:  payload.role ?? "user",
    },
    profile,
  });
});

// ── GET /api/auth/silent ──────────────────────────────────────────────────────
// Cookie:  rald_session=<rald_token>
// Returns: { valid: boolean, access_token?: string, user? }
//
// Called on every app mount to check for an existing cross-app session cookie
// (set by auth.rald.cloud) so returning users never re-authenticate.
router.get("/silent", async (req: Request, res: Response) => {
  if (!RALD_JWT_SECRET) {
    res.status(503).json({ valid: false, reason: "auth_not_configured" });
    return;
  }

  const cookieHeader = req.headers["cookie"] as string | undefined;
  const token = parseCookie(cookieHeader, "rald_session");
  if (!token) {
    res.status(401).json({ valid: false, reason: "no_session_cookie" });
    return;
  }

  const payload = await verifyJwt(token, RALD_JWT_SECRET);
  if (!payload) {
    res.status(401).json({ valid: false, reason: "invalid_or_expired_token" });
    return;
  }

  res.json({
    valid:        true,
    access_token: token,
    user: {
      id:    payload.id,
      phone: payload.phone ?? payload.email ?? "",
      role:  payload.role ?? "user",
    },
  });
});

export default router;
