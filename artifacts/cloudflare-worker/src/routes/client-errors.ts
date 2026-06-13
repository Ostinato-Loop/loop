// Loop — Client Error Beacon
// POST /api/errors
//
// No auth required — the app may have crashed before auth is established.
// All reports are logged to Cloudflare Workers logs (CF Dashboard → Workers → Logs)
// and optionally stored in Supabase (graceful degradation if table missing).
//
// CRASH-001 (2026-06-13): Added to diagnose production ErrorBoundary fires.
// LILCKY STUDIO LIMITED

import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import type { CloudflareEnv } from '../types/env.js';

const app = new Hono<{ Bindings: CloudflareEnv }>();

interface ClientErrorBody {
  error?:           string;
  component_stack?: string;
  url?:             string;
  ua?:              string;
  app_version?:     string;
  ts?:              string;
}

// POST /api/errors
app.post('/', async (c) => {
  let body: ClientErrorBody;
  try {
    body = await c.req.json<ClientErrorBody>();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const errorMsg       = String(body.error         ?? '').slice(0, 500);
  const componentStack = String(body.component_stack ?? '').slice(0, 1000);
  const url            = String(body.url            ?? '').slice(0, 200);
  const ua             = String(body.ua             ?? '').slice(0, 150);
  const appVersion     = String(body.app_version    ?? 'unknown').slice(0, 40);
  const ts             = String(body.ts             ?? new Date().toISOString());
  const country        = c.req.header('CF-IPCountry') ?? 'unknown';

  // Primary record — CF Workers logs (always written)
  console.error(JSON.stringify({
    level:           'error',
    type:            'client_crash',
    error:           errorMsg,
    component_stack: componentStack.slice(0, 300),
    url,
    ua:              ua.slice(0, 80),
    app_version:     appVersion,
    country,
    ts,
    service:         'loop-client',
  }));

  // Secondary record — Supabase (non-blocking; table may not exist yet)
  try {
    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('client_errors').insert({
      error:           errorMsg,
      component_stack: componentStack,
      url,
      ua,
      app_version:     appVersion,
      ip_country:      country,
      occurred_at:     ts,
      created_at:      new Date().toISOString(),
    });
  } catch {
    // Non-fatal — CF log is the primary record
  }

  return c.json({ ok: true }, 202);
});

export { app as clientErrors };
