// Loop — Create Sheet (bottom sheet for content creation)
// Adopted from loop-audio-ui-ux reference design.
// Routes updated for React Router DOM.
// LILCKY STUDIO LIMITED

import { Link } from "react-router-dom";
import { Mic, MessageSquare, Calendar, Users, Image as ImageIcon, FileText, X } from "lucide-react";

const actions = [
  { path: "/create/room",       icon: Mic,         label: "Audio Room",  desc: "Start a live conversation",     colorCls: "text-neon",      bgCls: "bg-neon/10" },
  { path: "/create/discussion", icon: MessageSquare, label: "Discussion", desc: "Open a public discussion",    colorCls: "text-foreground", bgCls: "bg-secondary" },
  { path: "/create/event",      icon: Calendar,    label: "Event",       desc: "Plan an event in your region",  colorCls: "text-orange",    bgCls: "bg-orange/10" },
  { path: "/create/community",  icon: Users,       label: "Community",   desc: "Build a new community",         colorCls: "text-foreground", bgCls: "bg-secondary" },
  { path: "/create/post",       icon: ImageIcon,   label: "Post",        desc: "Share photos & media",          colorCls: "text-foreground", bgCls: "bg-secondary" },
  { path: "/create/article",    icon: FileText,    label: "Article",     desc: "Publish long-form thoughts",    colorCls: "text-foreground", bgCls: "bg-secondary" },
] as const;

interface CreateSheetProps {
  open: boolean;
  onClose: () => void;
}

export function CreateSheet({ open, onClose }: CreateSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] bg-card rounded-t-3xl p-5 pb-8 animate-in slide-in-from-bottom duration-300 border-t border-border"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border mb-3" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Create on Loop</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Start something people in your region can join.</p>
        <div className="space-y-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.path}
                to={a.path}
                onClick={onClose}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary transition text-left"
              >
                <div className={`h-11 w-11 rounded-xl ${a.bgCls} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${a.colorCls}`} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
