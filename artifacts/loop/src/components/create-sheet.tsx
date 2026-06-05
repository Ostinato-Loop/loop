// Loop — Create Sheet
  // Audio Room is live. All other create types show "Soon" and a coming-soon page.
  // LILCKY STUDIO LIMITED

  import { useNavigate } from "react-router-dom";
  import { Mic, MessageSquare, Calendar, Users, Image as ImageIcon, FileText, X } from "lucide-react";

  interface Action {
    path: string;
    icon: typeof Mic;
    label: string;
    desc: string;
    colorCls: string;
    bgCls: string;
    live: boolean;
  }

  const actions: Action[] = [
    { path: "/create/room",       icon: Mic,           label: "Audio Room",  desc: "Start a live conversation",    colorCls: "text-neon",       bgCls: "bg-neon/10",   live: true  },
    { path: "/create/discussion", icon: MessageSquare, label: "Discussion",  desc: "Open a public discussion",     colorCls: "text-foreground", bgCls: "bg-secondary", live: false },
    { path: "/create/event",      icon: Calendar,      label: "Event",       desc: "Plan an event in your region", colorCls: "text-orange",     bgCls: "bg-orange/10", live: false },
    { path: "/create/community",  icon: Users,         label: "Community",   desc: "Build a new community",        colorCls: "text-foreground", bgCls: "bg-secondary", live: false },
    { path: "/create/post",       icon: ImageIcon,     label: "Post",        desc: "Share photos & media",         colorCls: "text-foreground", bgCls: "bg-secondary", live: false },
    { path: "/create/article",    icon: FileText,      label: "Article",     desc: "Publish long-form thoughts",   colorCls: "text-foreground", bgCls: "bg-secondary", live: false },
  ];

  interface CreateSheetProps {
    open: boolean;
    onClose: () => void;
  }

  export function CreateSheet({ open, onClose }: CreateSheetProps) {
    const navigate = useNavigate();
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
                <button
                  key={a.path}
                  onClick={() => { navigate(a.path); onClose(); }}
                  className={
                    "w-full flex items-center gap-3 p-3 rounded-2xl transition text-left " +
                    (a.live ? "hover:bg-secondary active:scale-[0.98]" : "opacity-60 cursor-pointer")
                  }
                >
                  <div className={`h-11 w-11 rounded-xl ${a.bgCls} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`h-5 w-5 ${a.colorCls}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{a.label}</span>
                      {!a.live && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-border text-muted-foreground uppercase tracking-wide">
                          Soon
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  