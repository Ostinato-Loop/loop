/**
 * useLiveRoomCount — real-time audience count for a single room.
 *
 * RETENTION-009 (2026-06-10)
 *
 * Subscribes to postgres_changes UPDATE events on the `rooms` table filtered
 * to the given room ID.  Returns the live `audience_count` value so any card
 * or row displaying this room shows a number that updates within ~200ms of a
 * participant joining or leaving — without any polling.
 *
 * The hook is intentionally lightweight:
 *   - One Supabase channel per room (channel name: `room-count:{roomId}`)
 *   - No auth required — rooms table is publicly readable
 *   - Syncs with parent if `initialCount` changes (e.g. parent re-fetches)
 *   - Cleans up the channel on unmount
 *
 * Usage:
 *   const count = useLiveRoomCount(room.id, room.audience_count);
 *
 * LILCKY STUDIO LIMITED
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLiveRoomCount(roomId: string, initialCount: number): {
  count:   number;
  updated: boolean; // true for 1.2 s after a live increment — use for flash animations
} {
  const [count,   setCount]   = useState(initialCount);
  const [updated, setUpdated] = useState(false);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef  = useRef(initialCount);

  // Sync if the parent re-fetches and passes a new initialCount
  useEffect(() => {
    if (prevRef.current !== initialCount) {
      prevRef.current = initialCount;
      setCount(initialCount);
    }
  }, [initialCount]);

  useEffect(() => {
    const ch = supabase
      .channel(`room-count:${roomId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "rooms",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          const newCount = (payload.new as { audience_count?: number }).audience_count;
          if (typeof newCount !== "number") return;

          setCount(prev => {
            if (newCount === prev) return prev;

            // Trigger flash animation on increment (someone joined)
            if (newCount > prev) {
              if (flashRef.current) clearTimeout(flashRef.current);
              setUpdated(true);
              flashRef.current = setTimeout(() => setUpdated(false), 1200);
            }

            return newCount;
          });
        },
      )
      .subscribe();

    return () => {
      if (flashRef.current) clearTimeout(flashRef.current);
      void supabase.removeChannel(ch);
    };
  }, [roomId]);

  return { count, updated };
}
