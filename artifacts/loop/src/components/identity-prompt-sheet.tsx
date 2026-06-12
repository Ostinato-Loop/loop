/**
 * IdentityPromptSheet
 *
 * A mobile-first bottom sheet that collects a single identity field
 * (bio, country, display_name) and writes it to BOTH:
 *   1. Supabase `profiles` table (Loop source of truth)
 *   2. RALD Identity Intelligence (cross-product sync via auth.rald.cloud)
 *
 * Shown in-context when a user triggers a feature that benefits from
 * the missing field. Never a blocker — always dismissible.
 *
 * Usage:
 *   <IdentityPromptSheet
 *     field={promptField}          // "bio" | "country" | "display_name" | null
 *     raldValues={raldValues}      // pre-fill from RALD intelligence
 *     onSaved={refreshProfile}     // called after successful save
 *     onDismiss={() => dismissField(promptField)}
 *     onOpenChange={(open) => { if (!open) closePrompt(); }}
 *   />
 *
 * LILCKY STUDIO LIMITED · 2026-06-12
 */

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { authedSupabase } from "@/integrations/supabase/client";
import { updateIdentityField } from "@/lib/api/identity";
import type { PromptField } from "@/hooks/use-progressive-identity";

type RaldValues = {
  username:      string | null;
  email:         string | null;
  phone:         string | null;
  profile_photo: string | null;
  country:       string | null;
  display_name:  string | null;
  bio:           string | null;
} | null;

interface Props {
  field:          PromptField;
  raldValues?:    RaldValues;
  onSaved:        () => void | Promise<void>;
  onDismiss:      () => void;
  onOpenChange:   (open: boolean) => void;
}

const COPY: Record<string, { title: string; description: string; placeholder: string; raldKey: keyof NonNullable<RaldValues>; dbColumn: string; multiline?: boolean; maxLen: number }> = {
  bio: {
    title:       "Add a bio",
    description: "Help people in rooms understand who you are and what you stand for.",
    placeholder: "Tell your story in a line…",
    raldKey:     "bio",
    dbColumn:    "bio",
    multiline:   true,
    maxLen:      160,
  },
  display_name: {
    title:       "Add a display name",
    description: "This is what others see when you speak. Defaults to your @handle.",
    placeholder: "e.g. Ada O.",
    raldKey:     "display_name",
    dbColumn:    "display_name",
    maxLen:      40,
  },
  country: {
    title:       "Where are you based?",
    description: "Civic and local rooms use your country to surface relevant conversations.",
    placeholder: "e.g. Nigeria, UK, USA…",
    raldKey:     "country",
    dbColumn:    "country",
    maxLen:      60,
  },
};

export function IdentityPromptSheet({ field, raldValues, onSaved, onDismiss, onOpenChange }: Props) {
  const { user } = useAuth();
  const [value, setValue]   = useState("");
  const [busy,  setBusy]    = useState(false);
  const open                = field !== null;
  const meta                = field ? COPY[field] : null;

  /* Pre-fill from RALD intelligence when sheet opens */
  useEffect(() => {
    if (!open || !meta || !raldValues) { setValue(""); return; }
    const prefill = raldValues[meta.raldKey];
    setValue(prefill ?? "");
  }, [open, field]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!meta || !user || busy) return;
    const trimmed = value.trim();
    if (!trimmed) { onDismiss(); return; }

    setBusy(true);
    try {
      // 1. Write to Supabase profiles (Loop source of truth)
      const { error } = await authedSupabase()
        .from("profiles")
        .update({ [meta.dbColumn]: trimmed })
        .eq("id", user.id);
      if (error) throw new Error(error.message);

      // 2. Sync to RALD Identity Intelligence (non-fatal)
      void updateIdentityField(meta.dbColumn, trimmed);

      toast.success(`${meta.title.replace("Add a ", "").replace("Where are you based?", "Location")} saved`);
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  if (!meta) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl px-6 pb-8 pt-6">
        <SheetHeader className="text-left mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Complete your profile</span>
          </div>
          <SheetTitle className="text-xl font-extrabold">{meta.title}</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground leading-snug">
            {meta.description}
          </SheetDescription>
        </SheetHeader>

        {/* Input */}
        {meta.multiline ? (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            rows={3}
            maxLength={meta.maxLen}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none resize-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
          />
        ) : (
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={meta.placeholder}
            maxLength={meta.maxLen}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
            className="w-full h-12 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors placeholder:text-muted-foreground"
          />
        )}
        <p className="text-[11px] text-muted-foreground mt-1 pl-1">{value.length}/{meta.maxLen}</p>

        {/* RALD pre-fill notice */}
        {raldValues?.[meta.raldKey] && (
          <p className="text-[11px] text-primary/70 mt-1 pl-1 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Pre-filled from your RALD profile — edit freely.
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-5">
          <Button
            onClick={handleSave}
            disabled={busy}
            className="h-12 w-full rounded-xl bg-gradient-mint text-primary-foreground font-semibold shadow-mint"
          >
            {busy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : value.trim() ? "Save" : "Skip for now"
            }
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="text-sm text-muted-foreground underline underline-offset-2 py-2 text-center"
          >
            Don&apos;t ask again
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
