/**
 * Loop — Room Quota Hook (RATE-LIMIT-001)
 *
 * Returns the authenticated user's room-creation quota for the current
 * 24 h window by calling GET /api/rooms/quota on the Loop Worker.
 *
 * The worker reads the same KV key written by POST /api/rooms so the
 * count is always consistent with server-side enforcement.
 *
 * Usage:
 *   const { quota, loading, refetch } = useRoomQuota(user?.id ?? null);
 *   // quota: { used: 1, limit: 3, remaining: 2 } | null
 *
 * LILCKY STUDIO LIMITED · 2026-06-10
 */

import { useState, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export interface RoomQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface UseRoomQuotaResult {
  /** null while loading or when not signed in */
  quota: RoomQuota | null;
  loading: boolean;
  /** Call after a successful room creation to sync the counter */
  refetch: () => void;
}

export function useRoomQuota(userId: string | null): UseRoomQuotaResult {
  const [quota, setQuota]   = useState<RoomQuota | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchQuota = useCallback(async () => {
    if (!userId) { setQuota(null); return; }
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/rooms/quota`);
      if (res.ok) {
        setQuota(await res.json() as RoomQuota);
      }
    } catch {
      // Network error — quota unknown, must not block the UI
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);

  return { quota, loading, refetch: fetchQuota };
}
