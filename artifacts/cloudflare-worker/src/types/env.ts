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
  LOOP_JWT_SECRET: string;
  OPENROUTER_API_KEY: string;
}
