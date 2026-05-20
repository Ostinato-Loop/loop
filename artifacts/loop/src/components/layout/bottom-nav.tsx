import { NavLink, useLocation } from "react-router-dom";
import { Compass, Radio, Plus, MessageCircle, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  to: string;
  label: string;
  icon: typeof Compass;
  exact?: boolean;
  center?: boolean;
};

const tabs: Tab[] = [
  { to: "/", label: "Discover", icon: Compass, exact: true },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/create", label: "Create", icon: Plus, center: true },
  { to: "/messages", label: "Inbox", icon: MessageCircle },
  { to: "/me", label: "You", icon: UserIcon },
];

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl safe-pb">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 pt-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          if (t.center) {
            return (
              <li key={t.to} className="-mt-6">
                <NavLink
                  to={t.to}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-mint text-primary-foreground shadow-mint transition-transform active:scale-95"
                  aria-label={t.label}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </NavLink>
              </li>
            );
          }
          return (
            <li key={t.to}>
              <NavLink
                to={t.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium tracking-wide transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_color-mix(in_oklab,var(--mint)_60%,transparent)]")} />
                <span>{t.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
