/**
 * Loop — Follows API Client
 *
 * Wraps /api/follows/* endpoints for the relationship graph.
 * All mutating calls require a valid Loop session token.
 *
 * LILCKY STUDIO LIMITED · 2026-06-07
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function getToken(): string | null {
  try { return localStorage.getItem("loop_token"); } catch { return null; }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type FollowCounts = {
  user_id:         string;
  followers_count: number;
  following_count: number;
};

/* ── Follow a user ────────────────────────────────────────────────────── */
export async function followUser(userId: string): Promise<{ ok: boolean; following: boolean }> {
  const r = await fetch(`${API_BASE}/api/follows/${userId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok && r.status !== 409) {
    const j = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(j.error ?? `Follow failed (${r.status})`);
  }
  return r.json() as Promise<{ ok: boolean; following: boolean }>;
}

/* ── Unfollow a user ─────────────────────────────────────────────────── */
export async function unfollowUser(userId: string): Promise<{ ok: boolean; following: boolean }> {
  const r = await fetch(`${API_BASE}/api/follows/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(j.error ?? `Unfollow failed (${r.status})`);
  }
  return r.json() as Promise<{ ok: boolean; following: boolean }>;
}

/* ── Get my follower + following counts ──────────────────────────────── */
export async function getMyFollowCounts(): Promise<FollowCounts> {
  const r = await fetch(`${API_BASE}/api/follows/me/counts`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`Could not load follow counts (${r.status})`);
  return r.json() as Promise<FollowCounts>;
}

/* ── Get any user's public counts ────────────────────────────────────── */
export async function getUserFollowCounts(userId: string): Promise<FollowCounts> {
  const r = await fetch(`${API_BASE}/api/follows/counts/${userId}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`Could not load follow counts (${r.status})`);
  return r.json() as Promise<FollowCounts>;
}

/* ── Check if I follow a user ────────────────────────────────────────── */
export async function getFollowStatus(userId: string): Promise<boolean> {
  const r = await fetch(`${API_BASE}/api/follows/status/${userId}`, { headers: authHeaders() });
  if (!r.ok) return false;
  const j = await r.json() as { following: boolean };
  return j.following;
}

/* ── React hook: my follow counts ────────────────────────────────────── */
import { useState, useEffect, useCallback } from "react";

export function useMyFollowCounts(): {
  followers: number;
  following: number;
  loading: boolean;
  refresh: () => void;
} {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getMyFollowCounts()
      .then((c) => { setFollowers(c.followers_count); setFollowing(c.following_count); })
      .catch(() => { /* silent — show 0 */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { followers, following, loading, refresh: load };
}

/* ── React hook: follow/unfollow a single user ───────────────────────── */
export function useFollow(userId: string | null): {
  following: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
} {
  const [following, setFollowing] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [checked,   setChecked]   = useState(false);

  useEffect(() => {
    if (!userId || checked) return;
    setChecked(true);
    getFollowStatus(userId)
      .then(setFollowing)
      .catch(() => { /* silent */ });
  }, [userId, checked]);

  const toggle = useCallback(async () => {
    if (!userId || loading) return;
    setLoading(true);
    try {
      if (following) {
        await unfollowUser(userId);
        setFollowing(false);
      } else {
        await followUser(userId);
        setFollowing(true);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, following, loading]);

  return { following, loading, toggle };
}
