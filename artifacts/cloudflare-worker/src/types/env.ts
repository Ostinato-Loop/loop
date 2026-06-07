/**
 * Typed environment bindings for the Loop Cloudflare Worker.
 * Mirrors wrangler.toml — keep in sync.
 */
export interface CloudflareEnv {
  DB: D1Database;
  CACHE: KVNamespace;
  MEDIA: R2Bucket;
  TASK_QUEUE: Queue;
  ROOM_SESSION: DurableObjectNamespace;
  AI: Ai;

  ENVIRONMENT: "development" | "staging" | "production";
  SUPABASE_URL: string;
  CORS_ORIGIN: string;

  // Secrets
  SUPABASE_SERVICE_ROLE_KEY: string;
  TERMII_API_KEY: string;
  TERMII_SENDER_ID: string;
  OPENROUTER_API_KEY: string;

  // RALD SSO — shared secret for local JWT verification (mirrors rald-auth-core)
  RALD_JWT_SECRET: string;

  // LiveKit — audio infrastructure (P0-FIX-001)
  // Provision via: wrangler secret put LIVEKIT_API_KEY
  //                wrangler secret put LIVEKIT_API_SECRET
  // Set in vars: LIVEKIT_URL = "wss://your-livekit-host.livekit.cloud"
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
}
