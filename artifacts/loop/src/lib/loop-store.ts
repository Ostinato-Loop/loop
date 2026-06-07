// Loop — Global UI Store
// Lightweight zustand store for room state, follows, interests, and notifications.
// Persisted to localStorage for seamless session continuity.
//
// P1-FIX-006: Removed hardcoded mock follows (tunde, wanjiku, ngozi) and
// mock interests. All real users start with an empty state, not fictional data.
// LILCKY STUDIO LIMITED

import React, { createContext, useCallback, useContext, useEffect, useReducer } from "react";

export type NotifLevel = "all" | "rooms" | "posts" | "off";

type State = {
  follows: Record<string, boolean>;
  notifPrefs: Record<string, NotifLevel>;
  joined: Record<string, boolean>;
  speakState: Record<string, "listener" | "raised" | "speaker">;
  muted: Record<string, boolean>;
  queuePos: Record<string, number>;
  interests: Record<string, boolean>;
  publishedRooms: { id: string; title: string; category: string; scope: string; at: number }[];
};

type Actions = {
  toggleFollow: (handle: string) => void;
  setNotifPref: (handle: string, l: NotifLevel) => void;
  setJoined: (roomId: string, v: boolean) => void;
  setSpeakState: (roomId: string, s: "listener" | "raised" | "speaker") => void;
  setQueuePos: (roomId: string, n: number) => void;
  toggleMute: (roomId: string) => void;
  toggleInterest: (id: string) => void;
  setInterests: (ids: string[]) => void;
  publishRoom: (r: { id: string; title: string; category: string; scope: string }) => void;
};

type Store = State & Actions;

const STORAGE_KEY = "loop-ui-state-v2";

/** Empty initial state — no mock data. Real user state comes from server (profile.interests, etc.) */
function emptyState(): State {
  return {
    follows: {},
    notifPrefs: {},
    joined: {},
    speakState: {},
    muted: {},
    queuePos: {},
    interests: {},
    publishedRooms: [],
  };
}

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* ignore */ }
  return emptyState();
}

function reducer(state: State, action: { type: string; payload: unknown }): State {
  switch (action.type) {
    case "toggleFollow": {
      const h = action.payload as string;
      const on = !state.follows[h];
      return {
        ...state,
        follows: { ...state.follows, [h]: on },
        notifPrefs: { ...state.notifPrefs, [h]: on ? (state.notifPrefs[h] ?? "all") : "off" },
      };
    }
    case "setNotifPref": {
      const { h, l } = action.payload as { h: string; l: NotifLevel };
      return { ...state, notifPrefs: { ...state.notifPrefs, [h]: l } };
    }
    case "setJoined": {
      const { r, v } = action.payload as { r: string; v: boolean };
      return { ...state, joined: { ...state.joined, [r]: v } };
    }
    case "setSpeakState": {
      const { r, st } = action.payload as { r: string; st: "listener" | "raised" | "speaker" };
      return { ...state, speakState: { ...state.speakState, [r]: st } };
    }
    case "setQueuePos": {
      const { r, n } = action.payload as { r: string; n: number };
      return { ...state, queuePos: { ...state.queuePos, [r]: n } };
    }
    case "toggleMute": {
      const r = action.payload as string;
      return { ...state, muted: { ...state.muted, [r]: !state.muted[r] } };
    }
    case "toggleInterest": {
      const id = action.payload as string;
      return { ...state, interests: { ...state.interests, [id]: !state.interests[id] } };
    }
    case "setInterests": {
      const ids = action.payload as string[];
      const interests: Record<string, boolean> = {};
      ids.forEach((id) => { interests[id.toLowerCase()] = true; });
      return { ...state, interests };
    }
    case "publishRoom": {
      const room = action.payload as { id: string; title: string; category: string; scope: string };
      return { ...state, publishedRooms: [{ ...room, at: Date.now() }, ...state.publishedRooms] };
    }
    default:
      return state;
  }
}

const LoopStoreCtx = createContext<Store | null>(null);

export function LoopStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const store: Store = {
    ...state,
    toggleFollow:  useCallback((h) => dispatch({ type: "toggleFollow", payload: h }), []),
    setNotifPref:  useCallback((h, l) => dispatch({ type: "setNotifPref", payload: { h, l } }), []),
    setJoined:     useCallback((r, v) => dispatch({ type: "setJoined", payload: { r, v } }), []),
    setSpeakState: useCallback((r, st) => dispatch({ type: "setSpeakState", payload: { r, st } }), []),
    setQueuePos:   useCallback((r, n) => dispatch({ type: "setQueuePos", payload: { r, n } }), []),
    toggleMute:    useCallback((r) => dispatch({ type: "toggleMute", payload: r }), []),
    toggleInterest:useCallback((id) => dispatch({ type: "toggleInterest", payload: id }), []),
    setInterests:  useCallback((ids) => dispatch({ type: "setInterests", payload: ids }), []),
    publishRoom:   useCallback((room) => dispatch({ type: "publishRoom", payload: room }), []),
  };

  return (
    <LoopStoreCtx.Provider value={store}>
      {children}
    </LoopStoreCtx.Provider>
  );
}

export function useLoop(): Store {
  const ctx = useContext(LoopStoreCtx);
  if (!ctx) throw new Error("useLoop must be used inside <LoopStoreProvider>");
  return ctx;
}
