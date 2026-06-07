// Loop — Bug Report / Feedback Endpoint
// POST /api/feedback
// Body: { message: string; page?: string }
//
// Stores feedback in Supabase feedback table.
// If the table doesn't exist yet, logs and acks gracefully (non-crashing).
// Auth required — only logged-in users can submit.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { CloudflareEnv } from "../types/env.js";
import { requireAuth } from "../middleware/auth.js";

const app = new Hono<{ Bindings: CloudflareEnv }>();

app.post("/", requireAuth(), async (c) => {
  const user = c.get("user");

  let body: { message?: string; page?: string };
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

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from("feedback").insert({
    user_id:    user.id,
    message,
    page:       body.page ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    // feedback table may not exist yet — log but acknowledge so user gets confirmation
    console.error("[feedback] insert error:", error.code, error.message);
  }

  return c.json({ ok: true, message: "Thank you — we'll look into it." }, 201);
});

export { app as feedback };
