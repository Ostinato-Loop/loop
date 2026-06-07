// Loop — 404 Not Found
// V1 Stabilization: Matches RALD dark theme, links back home.
// LILCKY STUDIO LIMITED

import { Link } from "react-router-dom";
import { Home, Mic } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center gap-6">
      <div className="h-20 w-20 rounded-3xl bg-surface border border-border flex items-center justify-center">
        <Mic className="h-9 w-9 text-muted-foreground/40" />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">404</p>
        <h1 className="text-2xl font-extrabold font-display text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          This room doesn't exist — or the link may have changed.
        </p>
      </div>

      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-mint active:scale-95 transition-transform"
      >
        <Home className="h-4 w-4" />
        Back to Feed
      </Link>
    </div>
  );
}
