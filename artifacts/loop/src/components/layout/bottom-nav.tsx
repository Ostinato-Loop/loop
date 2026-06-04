import { NavLink, useLocation } from "react-router-dom";
import { Home, Compass, Plus, MessageCircle, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { to: string; label: string; icon: typeof Home; exact?: boolean; center?: boolean };

const tabs: Tab[] = [
  { to: "/",        label: "Feed",    icon: Home,          exact: true },
  { to: "/live",    label: "Discover",icon: Compass },
  { to: "/create",  label: "Create",  icon: Plus,          center: true },
  { to: "/messages",label: "Chat",    icon: MessageCircle },
  { to: "/me",      label: "You",     icon: UserIcon },
];

export function BottomNav() {
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl safe-pb">
      <ul className="mx-auto flex max-w-md items-center h-16 px-2">
        {tabs.slice(0, 2).map((t) => {
          const Icon = t.icon;
          const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          return (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                <Icon
                  className={cn("h-[22px] w-[22px]", active ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span className={cn("text-[10px]", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {t.label}
                </span>
              </NavLink>
            </li>
          );
        })}

        {/* Center create button */}
        <li className="flex-1 flex items-center justify-center">
          <NavLink
            to="/create"
            aria-label="Create"
            className="-mt-7 h-14 w-14 rounded-full bg-gradient-mint text-primary-foreground flex items-center justify-center shadow-mint active:scale-95 transition border-4 border-background"
          >
            <Plus className="h-7 w-7" strokeWidth={3} />
          </NavLink>
        </li>

        {tabs.slice(3).map((t) => {
          const Icon = t.icon;
          const active = t.exact ? loc.pathname === t.to : loc.pathname.startsWith(t.to);
          return (
            <li key={t.to} className="flex-1">
              <NavLink
                to={t.to}
                className="flex flex-col items-center justify-center gap-0.5"
              >
                <Icon
                  className={cn("h-[22px] w-[22px]", active ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span className={cn("text-[10px]", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
                  {t.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
