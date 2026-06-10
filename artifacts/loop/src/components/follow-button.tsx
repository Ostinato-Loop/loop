/**
 * Loop — FollowButton
 * Reusable follow/unfollow button for any user profile.
 * FOLLOWS-001 (2026-06-09)
 * LILCKY STUDIO LIMITED
 */
import { useState, useEffect } from "react";
import { Loader2, UserPlus, UserCheck } from "lucide-react";
import { authFetch } from "@/lib/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface FollowButtonProps {
  userId:          string;
  initialFollowing?: boolean;        // undefined → fetch status from API
  onFollowChange?: (following: boolean, delta: number) => void;
  size?:           "sm" | "md";
  className?:      string;
}

export function FollowButton({
  userId,
  initialFollowing,
  onFollowChange,
  size = "md",
  className,
}: FollowButtonProps) {
  const { user }    = useAuth();
  const API_BASE    = import.meta.env.VITE_API_BASE_URL ?? "";
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [loading,   setLoading]   = useState(initialFollowing === undefined);
  const [busy,      setBusy]      = useState(false);

  // Fetch follow status when not provided by parent
  useEffect(() => {
    if (!user || !userId || userId === user.id || initialFollowing !== undefined) return;
    authFetch(`${API_BASE}/api/follows/status/${userId}`)
      .then(r => r.ok ? r.json() as Promise<{ following: boolean }> : Promise.reject())
      .then(d => setFollowing(d.following))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, user, initialFollowing, API_BASE]);

  // Don't render for self or unauthenticated
  if (!user || userId === user.id) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing); // optimistic update
    try {
      const res = await authFetch(`${API_BASE}/api/follows/${userId}`, {
        method: wasFollowing ? "DELETE" : "POST",
      });
      if (!res.ok) throw new Error("Failed");
      onFollowChange?.(!wasFollowing, wasFollowing ? -1 : 1);
    } catch {
      setFollowing(wasFollowing); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={cn(
        "rounded-full bg-secondary animate-pulse",
        size === "sm" ? "h-7 w-16" : "h-9 w-20",
        className,
      )} />
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={following ? "Unfollow" : "Follow"}
      className={cn(
        "flex items-center gap-1.5 rounded-full font-semibold transition-all active:scale-95 disabled:opacity-60",
        size === "sm"
          ? "text-xs px-3 py-1.5 h-7"
          : "text-sm px-4 py-2 h-9",
        following
          ? "bg-secondary border border-border text-foreground hover:border-destructive/40 hover:text-destructive"
          : "bg-primary text-primary-foreground neon-glow",
        className,
      )}
    >
      {busy ? (
        <Loader2 className={size === "sm" ? "h-3 w-3 animate-spin" : "h-3.5 w-3.5 animate-spin"} />
      ) : following ? (
        <UserCheck className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : (
        <UserPlus className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      )}
      {busy ? null : following ? "Following" : "Follow"}
    </button>
  );
}
