/**
 * Loop — Room Streak Hook (RETENTION-014)
 *
 * Tracks consecutive days a user has joined or hosted a room.
 * Activity is recorded in localStorage so it works for both hosts
 * (whose rooms persist in the DB) and listeners (whose participant
 * rows are deleted when they leave — no permanent DB history).
 *
 * Storage key: loop:streak:{userId}
 * Format:      string[] of ISO date strings, descending, max 90 entries
 *
 * Streak rules:
 *   - A streak day = any calendar day the user entered at least one room
 *   - An active streak must include today OR yesterday (to survive
 *     timezones and users who haven't opened the app yet today)
 *   - Consecutive = no gap larger than 1 day between any two entries
 *
 * LILCKY STUDIO LIMITED · 2026-06-10
 */

import { useState, useEffect } from "react";

const MAX_DAYS = 90;

function streakKey(userId: string): string {
  return `loop:streak:${userId}`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // "2026-06-10"
}

/**
 * Call this once every time the user enters a room (join or host).
 * Idempotent — calling it multiple times on the same day is safe.
 */
export function updateStreak(userId: string): void {
  try {
    const today = toDateStr(new Date());
    const raw   = localStorage.getItem(streakKey(userId));
    const dates: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    if (dates[0] === today) return; // already recorded today

    const cutoff = toDateStr(new Date(Date.now() - MAX_DAYS * 86400000));
    const next   = [today, ...dates.filter(d => d >= cutoff)];
    localStorage.setItem(streakKey(userId), JSON.stringify(next));
  } catch {
    // localStorage unavailable or quota exceeded — fail silently
  }
}

/**
 * Compute the length of the current consecutive streak from a sorted
 * descending list of ISO date strings.
 */
function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;

  const today     = toDateStr(new Date());
  const yesterday = toDateStr(new Date(Date.now() - 86400000));

  // Streak must be active (touched today or yesterday)
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    // diff between consecutive entries must be exactly 1 calendar day
    const a    = new Date(dates[i - 1]);
    const b    = new Date(dates[i]);
    const diff = Math.round((a.getTime() - b.getTime()) / 86400000);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Returns the current room streak count for a user.
 * Re-reads from localStorage each time the userId changes.
 */
export function useRoomStreak(userId: string | null): number {
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!userId) { setStreak(0); return; }
    try {
      const raw   = localStorage.getItem(streakKey(userId));
      const dates: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      setStreak(computeStreak(dates));
    } catch {
      setStreak(0);
    }
  }, [userId]);

  return streak;
}
