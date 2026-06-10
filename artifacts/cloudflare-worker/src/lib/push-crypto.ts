/**
 * Loop — OneSignal REST Client (Cloudflare Worker)
 * Replaces the VAPID push-crypto module.
 * PUSH-001 (2026-06-10)
 * LILCKY STUDIO LIMITED
 *
 * OneSignal REST API v1:
 *   POST https://onesignal.com/api/v1/notifications
 *   Authorization: Key <REST_API_KEY>
 *
 * Users are targeted by external_id = their Supabase user UUID.
 * Set via OneSignal.login(userId) in the frontend after authentication.
 */

export interface OneSignalPayload {
  /** External user IDs (Supabase UUIDs) to target. Max 2000 per call. */
  externalIds: string[];
  headings:    { en: string } & Record<string, string>;
  contents:    { en: string } & Record<string, string>;
  /** Deep-link URL opened when notification is tapped. */
  webUrl?:     string;
  /** Custom data passed to notification click handler. */
  data?:       Record<string, unknown>;
  /** Deduplication key — prevents duplicate notifications for same event. */
  tag?:        string;
  icon?:       string;
}

export interface OneSignalResult {
  ok:        boolean;
  recipients: number;
  id?:       string;
  errors?:   unknown;
}

export async function sendOneSignalNotification(
  appId:      string,
  restApiKey: string,
  payload:    OneSignalPayload,
): Promise<OneSignalResult> {
  const BATCH = 2000;
  let totalRecipients = 0;
  let lastResult: OneSignalResult = { ok: true, recipients: 0 };

  // OneSignal caps include_aliases at 2000 per request — fan out in batches
  for (let i = 0; i < payload.externalIds.length; i += BATCH) {
    const batch = payload.externalIds.slice(i, i + BATCH);

    const body: Record<string, unknown> = {
      app_id:   appId,
      headings: payload.headings,
      contents: payload.contents,
      include_aliases: { external_id: batch },
      target_channel:  "push",
    };

    if (payload.webUrl)  body.web_url            = payload.webUrl;
    if (payload.data)    body.data               = payload.data;
    if (payload.icon)    body.chrome_web_icon     = payload.icon;
    if (payload.tag)     body.collapse_id         = payload.tag;  // collapses duplicate notifs

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method:  "POST",
      headers: {
        "Authorization":  `Key ${restApiKey}`,
        "Content-Type":   "application/json",
        "Accept":         "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { id?: string; recipients?: number; errors?: unknown };

    if (!res.ok) {
      console.error("[onesignal] dispatch error:", res.status, JSON.stringify(json).slice(0, 200));
      lastResult = { ok: false, recipients: totalRecipients, errors: json.errors };
      continue;
    }

    totalRecipients += json.recipients ?? 0;
    lastResult = { ok: true, recipients: totalRecipients, id: json.id };
  }

  return lastResult;
}
