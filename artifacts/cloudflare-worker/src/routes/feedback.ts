// Loop — Bug Report / Feedback Endpoint
// POST /api/feedback
// Body: { message: string; page?: string; screenshot_url?: string }
//
// Stores feedback in Supabase feedback table.
// Auth required — only logged-in users can submit.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import type { CloudflareEnv } from "../types/env.js";
import { requireAuth } from "../middleware/auth.js";
import { sbClient } from "../lib/supabase.js";

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.post("/", requireAuth(), async (c) => {
  const user = c.get("user");

  let body: { message?: string; page?: string; screenshot_url?: string };
  try {
    body = await c.req.json<typeof body>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const message = (body.message ?? "").trim();
  if (!message || message.length < 5) {
    return c.json({ error: "message must be at least 5 characters" }, 400);
  }
  if (message.length > 2000) {
    return c.json({ error: "message too long (max 2000 chars)" }, 400);
  }

  const sb = sbClient(c.env);
  const { error } = await sb.from("feedback").insert({
    user_id:        user.id,
    message,
    page:           body.page ?? null,
    screenshot_url: body.screenshot_url ?? null,
    created_at:     new Date().toISOString(),
  });

  if (error) {
    // feedback table may not exist yet — log but don't fail the user
    console.error("[feedback] insert error:", error.message);
    // Still return 201 so the user gets acknowledgment
  }

  return c.json({ ok: true, message: "Thank you — we'll look into it." }, 201);
});

export { app as feedback };
