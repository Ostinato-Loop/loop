/**
 * useFollow — Follow / unfollow a Loop user via the Relationship Graph API.
 *
 * Optimistic UI: state toggles immediately, rolls back on API failure.
 * On success the relationship is persisted to Supabase via the Loop API worker.
 *
 * Usage:
 *   const { following, loading, toggle } = useFollow(userId);
 *
 * LILCKY STUDIO LIMITED · 2026-06-08
 */

import { useState, useCallback } from "react";
import { authFetch } from "@/lib/api-fetch";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export function useFollow(userId: string, initialFollowing = false) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (loading || !userId) return;
    setLoading(true);
    setError(null);

    const prev = following;
    setFollowing(!prev); // optimistic update

    try {
      const method = prev ? "DELETE" : "POST";
      const res    = await authFetch(`${API_BASE}/api/follows/${userId}`, { method });

      if (!res.ok && res.status !== 201) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setFollowing(prev); // rollback
        setError(body.error ?? "Could not update follow");
      }
    } catch {
      setFollowing(prev); // rollback on network error
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }, [userId, following, loading]);

  return { following, loading, error, toggle };
}
