// Loop — Bottom Navigation (Launch UI)
// Adopted from loop-audio-ui-ux reference design.
// LILCKY STUDIO LIMITED

import { Link, useLocation } from "react-router-dom";
import { Home, Compass, Plus, MessageCircle, User as UserIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { fetchUnreadCount } from "@/lib/api/notifications";
import { CreateSheet } from "@/components/create-sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/",         label: "Feed",    icon: Home,          exact: true },
  { to: "/discover", label: "Discover", icon: Compass,      exact: false },
  { to: "/messages", label: "Chat",    icon: MessageCircle, exact: false },
  { to: "/me",       label: "You",     icon: UserIcon,      exact: false },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetchUnreadCount().then(setUnread).catch(() => {});
  }, [pathname]);

  return (
    <>
      <nav className="sticky bottom-0 left-0 right-0 z-40 bg-background/85 backdrop-blur-xl border-t border-border">
        <div className="relative grid grid-cols-5 h-16 items-center px-2 pb-[env(safe-area-inset-bottom)]">
          {navItems.slice(0, 2).map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className="flex flex-col items-center justify-center gap-0.5">
                <Icon
                  className={cn("h-[22px] w-[22px]", active ? "text-neon" : "text-muted-foreground")}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span className={cn("text-[10px]", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <div className="flex items-center justify-center">
            <button
              onClick={() => setCreateOpen(true)}
              aria-label="Create"
              className="-mt-7 h-14 w-14 rounded-full bg-neon text-neon-foreground flex items-center justify-center neon-glow active:scale-95 transition border-4 border-background"
            >
              <Plus className="h-7 w-7" strokeWidth={3} />
            </button>
          </div>

          {navItems.slice(2).map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className="flex flex-col items-center justify-center gap-0.5">
                <div className="relative">
                  <Icon
                    className={cn("h-[22px] w-[22px]", active ? "text-neon" : "text-muted-foreground")}
                    strokeWidth={active ? 2.4 : 2}
                  />
                  {item.to === "/me" && unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary border border-background" />
                  )}
                </div>
                <span className={cn("text-[10px]", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
