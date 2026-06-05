import { useNavigate } from "react-router-dom";
  import { useEffect, useState } from "react";
  import { useAuth, openMessenger } from "@/hooks/use-auth";
  import { AppShell } from "@/components/layout/app-shell";
  import { MessageCircle, Mic, ExternalLink } from "lucide-react";
  import { cn } from "@/lib/utils";

  type ConvoTab = "direct" | "rooms";

  export default function MessagesPage() {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState<ConvoTab>("direct");

    useEffect(() => {
      if (!loading && !user) navigate("/login");
    }, [user, loading, navigate]);

    return (
      <AppShell>
        <header className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold">Inbox</h1>
            <button
              onClick={() => openMessenger()}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface"
              aria-label="Open Messenger"
            >
              <Mic className="h-4 w-4 text-primary" />
            </button>
          </div>

          <div className="mt-3 flex gap-1 rounded-xl bg-surface p-1">
            {(["direct", "rooms"] as ConvoTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors",
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {t === "direct" ? "Direct" : "Rooms"}
              </button>
            ))}
          </div>
        </header>

        <div className="px-5 pb-6">
          {tab === "direct" && (
            <div className="flex flex-col items-center justify-center gap-5 pt-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <MessageCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-semibold text-base">Direct messages</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Your conversations live in RALD Messenger. Tap below to open them with your current session.
                </p>
              </div>
              <button
                onClick={() => openMessenger("/chats")}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Open Messenger <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {tab === "rooms" && (
            <div className="flex flex-col items-center justify-center gap-5 pt-16 text-center">
              <div className="h-16 w-16 rounded-2xl bg-secondary flex items-center justify-center">
                <Mic className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-semibold text-base">Room conversations</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Once you join or host a room, your room chats will appear here.
                </p>
              </div>
              <button
                onClick={() => navigate("/discover")}
                className="rounded-xl bg-secondary px-5 py-2.5 text-sm font-semibold text-foreground"
              >
                Discover rooms
              </button>
            </div>
          )}
        </div>
      </AppShell>
    );
  }
  