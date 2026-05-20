/**
 * @workspace/loop-api-client
 *
 * Typed fetch client for the Loop Cloudflare Worker API.
 * Import this in the React frontend instead of raw fetch calls.
 *
 * Usage (frontend):
 *   import { createLoopApiClient } from "@workspace/loop-api-client";
 *   const api = createLoopApiClient({ baseUrl: "/api", getToken: () => session?.access_token });
 *   const trending = await api.trending.get();
 */

import type {
  HealthResponse,
  TrendingResponse,
  RoomRecommendationsResponse,
  QueueSummaryResponse,
  ApiError,
} from "@workspace/loop-shared-types";

// ── Client config ─────────────────────────────────────────────────────

export interface LoopApiClientConfig {
  /** Base URL for the Worker API. In dev: "/api". In prod: your CF Worker URL or "/api". */
  baseUrl: string;
  /** Returns the current Supabase access token, or undefined if not authenticated. */
  getToken?: () => string | undefined;
}

// ── Response wrapper ──────────────────────────────────────────────────

export type ApiResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ApiError; status: number };

// ── Core fetch helper ─────────────────────────────────────────────────

async function apiFetch<T>(
  config: LoopApiClientConfig,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const token = config.getToken?.();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  };

  try {
    const res = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
    const body = await res.json() as T | ApiError;

    if (!res.ok) {
      return { ok: false, error: body as ApiError, status: res.status };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    return {
      ok: false,
      error: { error: err instanceof Error ? err.message : "Network error" },
      status: 0,
    };
  }
}

// ── Client factory ────────────────────────────────────────────────────

export function createLoopApiClient(config: LoopApiClientConfig) {
  const get = <T>(path: string) => apiFetch<T>(config, path);
  const post = <T>(path: string, body: unknown) =>
    apiFetch<T>(config, path, { method: "POST", body: JSON.stringify(body) });

  return {
    /**
     * GET /api/health
     * Check worker liveness and binding status.
     */
    health: {
      get: (): Promise<ApiResult<HealthResponse>> =>
        get("/health"),
    },

    /**
     * GET /api/trending[?lang=en]
     * Trending rooms, topics, and creators.
     */
    trending: {
      get: (params?: { lang?: string }): Promise<ApiResult<TrendingResponse>> => {
        const qs = params?.lang ? `?lang=${params.lang}` : "";
        return get(`/trending${qs}`);
      },
    },

    /**
     * GET /api/rooms/recommendations[?limit=10&lang=en]
     * Personalised room feed for the current user.
     */
    rooms: {
      recommendations: (params?: {
        limit?: number;
        lang?: string;
      }): Promise<ApiResult<RoomRecommendationsResponse>> => {
        const qp = new URLSearchParams();
        if (params?.limit) qp.set("limit", String(params.limit));
        if (params?.lang)  qp.set("lang", params.lang);
        const qs = qp.toString() ? `?${qp}` : "";
        return get(`/rooms/recommendations${qs}`);
      },

      /**
       * POST /api/rooms/:roomId/queue-summary
       * Enqueue an AI summary job when a room ends.
       */
      queueSummary: (roomId: string): Promise<ApiResult<QueueSummaryResponse>> =>
        post(`/rooms/${roomId}/queue-summary`, {}),
    },
  };
}

export type LoopApiClient = ReturnType<typeof createLoopApiClient>;
