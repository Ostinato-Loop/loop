/**
 * useProgressiveIdentity
 *
 * Fetches the RALD Identity Intelligence snapshot once per session.
 * Returns the raw intel, a list of missing profile fields, and helpers
 * to open/close the IdentityPromptSheet for any field.
 *
 * Usage:
 *   const { intel, missingFields, showPrompt, dismissField, promptField } = useProgressiveIdentity();
 *   // Trigger a sheet when user taps a contextual CTA:
 *   <button onClick={() => showPrompt("bio")}>Add bio</button>
 *   <IdentityPromptSheet field={promptField} onOpenChange={...} onSaved={...} />
 *
 * LILCKY STUDIO LIMITED · 2026-06-12
 */

import { useCallback, useEffect, useState } from "react";
import {
  getIdentityIntelligence,
  dismissIdentityPrompt,
  type IdentityIntelligence,
} from "@/lib/api/identity";
import { useAuth } from "@/hooks/use-auth";

export type PromptField = "bio" | "country" | "display_name" | null;

export type MissingField = {
  field:   PromptField & string;
  label:   string;
  reason:  string; // contextual explanation shown in the sheet
};

const FIELD_META: Record<string, { label: string; reason: string }> = {
  bio:          { label: "Bio",         reason: "Help people in rooms understand who you are and what you stand for." },
  country:      { label: "Country",     reason: "Civic and local rooms use your location to surface relevant conversations." },
  display_name: { label: "Display name", reason: "A display name helps people recognise you when you speak in rooms." },
};

export function useProgressiveIdentity() {
  const { user, profile } = useAuth();
  const [intel,         setIntel]         = useState<IdentityIntelligence | null>(null);
  const [dismissed,     setDismissed]     = useState<Set<string>>(new Set());
  const [promptField,   setPromptField]   = useState<PromptField>(null);
  const [loaded,        setLoaded]        = useState(false);

  /* ── Fetch intelligence once per user session ─────────────────────── */
  useEffect(() => {
    if (!user || loaded) return;
    getIdentityIntelligence()
      .then((data) => {
        setIntel(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [user?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Derive which profile fields are missing ──────────────────────── */
  const missingFields: MissingField[] = [];

  if (loaded && profile) {
    if (!profile.bio && !dismissed.has("bio")) {
      missingFields.push({ field: "bio", ...FIELD_META.bio });
    }
    if (!profile.display_name && !dismissed.has("display_name")) {
      missingFields.push({ field: "display_name", ...FIELD_META.display_name });
    }
  }

  /* ── Actions ─────────────────────────────────────────────────────── */
  const showPrompt = useCallback((field: PromptField) => {
    setPromptField(field);
  }, []);

  const closePrompt = useCallback(() => {
    setPromptField(null);
  }, []);

  const dismissField = useCallback((field: string) => {
    setDismissed((prev) => new Set([...prev, field]));
    setPromptField(null);
    void dismissIdentityPrompt(field);
  }, []);

  /* ── Pre-fill values from RALD intelligence ─────────────────────── */
  const raldValues = intel?._values ?? null;

  return {
    intel,
    missingFields,
    promptField,
    showPrompt,
    closePrompt,
    dismissField,
    raldValues,
    loaded,
  };
}
