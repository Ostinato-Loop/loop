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
  CLEANUP_COORDINATOR: DurableObjectNamespace;
  AI: Ai;

  ENVIRONMENT: "development" | "staging" | "production";
  SUPABASE_URL: string;
  CORS_ORIGIN: string;

  // Secrets
  SUPABASE_SERVICE_ROLE_KEY: string;
  TERMII_API_KEY: string;
  TERMII_SENDER_ID: string;
  OPENROUTER_API_KEY: string;

  // RALD SSO
  RALD_JWT_SECRET: string;

  // LiveKit
  LIVEKIT_URL: string;
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;

  // Messenger webhook
  MESSENGER_WEBHOOK_KEY: string;

  // OneSignal — Push Notifications (PUSH-001)
  // Dashboard: app.onesignal.com → Settings → Keys & IDs
  // Provision via:
  //   wrangler secret put ONESIGNAL_APP_ID      (also needed as VITE_ONESIGNAL_APP_ID in Pages)
  //   wrangler secret put ONESIGNAL_REST_API_KEY
  ONESIGNAL_APP_ID:      string;
  ONESIGNAL_REST_API_KEY: string;
}
