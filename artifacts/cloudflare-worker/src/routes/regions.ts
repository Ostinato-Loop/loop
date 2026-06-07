/**
 * Loop API — RALD Region Registry Route
 *
 * Hono router mounted at /api/regions in src/index.ts.
 * Backed by rald_regions table (migration 009).
 *
 * Sprint: RALD Region Registry (2026-06-07)
 *
 * Routes
 * ──────
 *  GET /api/regions/search?q=Ikeja&country=NG&limit=10
 *    Fuzzy search over area names + aliases.
 *    Returns [{area_name, country, state_id, lga_id, lcda_id, display_label}]
 *    Used by V3 onboarding location step — one input, four outputs.
 *
 *  GET /api/regions/:id
 *    Fetch a single region by UUID.
 *
 *  GET /api/regions/by-state/:stateId?country=NG
 *    List all regions for a given state_id.
 */

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";

const regions = new Hono<{ Bindings: CloudflareEnv }>();

// ── Supabase REST helpers ─────────────────────────────────────────────
//
// FIX (2026-06-07): Previously used createClient() and accessed private
// internal properties (.supabaseUrl, .supabaseKey) via `as unknown as`.
// Those properties are implementation details that can change between
// @supabase/supabase-js minor versions and have no stable type contract.
// Now passes url + key directly — no private property access, no client.

function sbGet(url: string, key: string, path: string): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "GET",
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
  });
}

function sbPost(url: string, key: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      apikey:         key,
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
      Prefer:         "return=representation",
    },
    body: JSON.stringify(body),
  });
}

function traceId(c: { req: { header(name: string): string | undefined } }): string {
  return (
    c.req.header("X-Trace-Id") ??
    c.req.header("X-Request-Id") ??
    crypto.randomUUID()
  );
}

// ── Region shape returned to clients ─────────────────────────────────

interface RegionResult {
  id:            string;
  area_name:     string;
  area_type:     string;
  country:       string;
  state_id:      string;
  lga_id:        string | null;
  lcda_id:       string | null;
  display_label: string;
  aliases:       string[];
}


// ══════════════════════════════════════════════════════════════════════
// GET /api/regions/search?q=Ikeja&country=NG&limit=10
//
// Core V3 onboarding endpoint.
// User types "Ikeja" → returns [{state_id:"lagos", lga_id:"ikeja",
//   lcda_id:"ikeja-central", country:"NG", display_label:"Ikeja, Lagos"}]
// Client selects one → passes all four fields to POST /api/activation/auto-join
// ══════════════════════════════════════════════════════════════════════

regions.get("/search", async (c) => {
  const q       = c.req.query("q")?.trim() ?? "";
  const country = c.req.query("country")?.toUpperCase() ?? null;
  const limit   = Math.min(Number(c.req.query("limit") ?? 10), 30);
  const tid     = traceId(c);

  if (q.length < 2) {
    return c.json({
      results: [],
      query:   q,
      count:   0,
      hint:    "Provide at least 2 characters",
    });
  }

  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  // Call search_region RPC (migration 009)
  const resp = await sbPost(sbUrl, sbKey, "/rest/v1/rpc/search_region", {
    p_query:   q,
    p_country: country,
    p_limit:   limit,
  });

  if (!resp.ok) {
    // Fallback: plain ILIKE query if RPC fails (e.g. word_similarity not available)
    console.error(`[regions/search] rpc failed ${resp.status} trace=${tid} — falling back to ILIKE`);

    let ilikePath =
      `/rest/v1/rald_regions?is_active=eq.true` +
      `&area_name=ilike.*${encodeURIComponent(q)}*` +
      `&select=id,area_name,area_type,country,state_id,lga_id,lcda_id,display_label,aliases` +
      `&order=area_name.asc&limit=${limit}`;

    if (country) ilikePath += `&country=eq.${encodeURIComponent(country)}`;

    const fallbackResp = await sbGet(sbUrl, sbKey, ilikePath);
    if (!fallbackResp.ok) {
      console.error(`[regions/search] fallback also failed ${fallbackResp.status} trace=${tid}`);
      return c.json({ error: "Region search unavailable" }, 500);
    }

    const fallbackData = await fallbackResp.json() as RegionResult[];
    return c.json({
      results: fallbackData,
      query:   q,
      count:   fallbackData.length,
      source:  "fallback",
    });
  }

  const data = await resp.json() as RegionResult[];

  console.log("[regions/search]", JSON.stringify({
    q, country, count: data.length, trace: tid,
  }));

  return c.json({
    results: data,
    query:   q,
    count:   data.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/regions/by-state/:stateId?country=NG&type=lcda
// List all regions in a state — used for "browse by state" UI.
// ══════════════════════════════════════════════════════════════════════

regions.get("/by-state/:stateId", async (c) => {
  const { stateId } = c.req.param();
  const country     = (c.req.query("country") ?? "NG").toUpperCase();
  const type        = c.req.query("type");  // optional: lcda | lga | city | neighbourhood
  const limit       = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  let path =
    `/rest/v1/rald_regions?is_active=eq.true` +
    `&country=eq.${encodeURIComponent(country)}` +
    `&state_id=eq.${encodeURIComponent(stateId)}` +
    `&select=id,area_name,area_type,country,state_id,lga_id,lcda_id,display_label,aliases` +
    `&order=area_name.asc&limit=${limit}`;

  if (type) path += `&area_type=eq.${encodeURIComponent(type)}`;

  const resp = await sbGet(sbUrl, sbKey, path);
  if (!resp.ok) return c.json({ error: "Failed to fetch regions" }, 500);

  const data = await resp.json() as RegionResult[];
  return c.json({
    regions: data,
    state_id: stateId,
    country,
    count: data.length,
  });
});


// ══════════════════════════════════════════════════════════════════════
// GET /api/regions/:id
// Fetch a single region by UUID — used to confirm selection.
// ══════════════════════════════════════════════════════════════════════

regions.get("/:id", async (c) => {
  const { id } = c.req.param();

  // Validate UUID format (avoid injecting arbitrary strings into Supabase query)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return c.json({ error: "Invalid region ID format" }, 400);
  }

  const sbUrl = c.env.SUPABASE_URL;
  const sbKey = c.env.SUPABASE_SERVICE_ROLE_KEY;

  const resp = await sbPost(sbUrl, sbKey, "/rest/v1/rpc/get_region_by_id", {
    p_id: id,
  });

  if (!resp.ok) return c.json({ error: "Failed to fetch region" }, 500);

  const data = await resp.json() as RegionResult | null;
  if (!data || (data as unknown as Record<string, unknown>).id === undefined) {
    return c.json({ error: "Region not found" }, 404);
  }

  return c.json({ region: data });
});

export { regions };
