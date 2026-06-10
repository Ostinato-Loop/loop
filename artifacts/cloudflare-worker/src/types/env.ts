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

  // Messenger integration — shared key for DM notification webhook
  // Provision via: wrangler secret put MESSENGER_WEBHOOK_KEY
  // Same value must be set in the Messenger worker as LOOP_API_WEBHOOK_KEY
  MESSENGER_WEBHOOK_KEY: string;

  // Web Push — VAPID keys (RFC 8292)
  // Generate once with: npx web-push generate-vapid-keys
  // Provision via:
  //   wrangler secret put VAPID_PRIVATE_KEY
  //   wrangler secret put VAPID_PUBLIC_KEY   (can also be a plain var)
  //   wrangler secret put VAPID_SUBJECT      (mailto: or https: URI)
  // The public key must also be set in Loop frontend:
  //   VITE_VAPID_PUBLIC_KEY=<same value>
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;   // e.g. "mailto:push@loop.fm"
}
