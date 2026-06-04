// Loop — Feed Page (Launch UI)
// Adopted from loop-audio-ui-ux reference design.
// Adapted for React Router DOM.
// LILCKY STUDIO LIMITED

import { Link } from "react-router-dom";
import { Search, Bell, MapPin, Mic, MessageCircle, Share2, Heart, Calendar, Sparkles, TrendingUp, Newspaper, Users } from "lucide-react";
import { feed, userRegion, type FeedItem, type Room } from "@/lib/loop-mock";
import { LoopMark } from "@/components/loop-logo";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";

export default function FeedPage() {
  return (
    <AppShell>
      <FeedHeader />
      <div className="px-4 pt-3 pb-6 space-y-3">
        <LiveStrip />
        {feed.map((it, i) => <FeedCard key={i} item={it} />)}
      </div>
    </AppShell>
  );
}

function FeedHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-neon flex items-center justify-center neon-glow">
            <LoopMark className="h-4 w-6 text-neon-foreground" />
          </div>
          <div>
            <div className="text-base font-extrabold leading-none">Loop</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-2.5 w-2.5" /> {userRegion.city} · {userRegion.country}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center" aria-label="Search" onClick={() => {}}>
            <Search className="h-4 w-4" />
          </button>
          <button className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center relative" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-neon" />
          </button>
        </div>
      </div>
      <RegionScroller />
    </header>
  );
}

function RegionScroller() {
  const tabs = ["For you", "Lagos", "Nigeria", "Africa", "Civic", "Music", "Sports", "Campus"];
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2.5">
      {tabs.map((t, i) => (
        <button
          key={t}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
            i === 0 ? "bg-foreground text-background" : "bg-secondary text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function LiveStrip() {
  const live = feed.filter((f): f is { kind: "room"; room: Room } => f.kind === "room" && f.room.live);
  return (
    <div className="-mx-4 px-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-live animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider">Live near you</span>
        </div>
        <button className="text-xs text-muted-foreground">See all</button>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {live.map(({ room }) => (
          <Link
            key={room.id}
            to={`/rooms/${room.id}`}
            className="shrink-0 w-44 rounded-2xl bg-card border border-border p-3 hover:border-neon transition"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
              <span className="text-[10px] font-bold uppercase text-live">Live</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{room.region}</span>
            </div>
            <div className="text-xs font-semibold line-clamp-2 mb-2 min-h-[2rem]">{room.title}</div>
            <div className="flex items-center gap-1">
              {room.speakers.slice(0, 3).map((s) => (
                <img key={s.name} src={s.avatar} alt="" className="h-5 w-5 rounded-full border-2 border-card -ml-1 first:ml-0" />
              ))}
              <span className="text-[10px] text-muted-foreground ml-1">{formatN(room.listeners)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  if (item.kind === "room") return <RoomCard room={item.room} />;
  if (item.kind === "discussion") return <DiscussionCard item={item} />;
  if (item.kind === "event") return <EventCard item={item} />;
  if (item.kind === "opportunity") return <OpportunityCard item={item} />;
  return <NewsCard item={item} />;
}

function RoomCard({ room }: { room: Room }) {
  return (
    <Link to={`/rooms/${room.id}`} className="block rounded-2xl bg-card border border-border overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {room.live && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse" />
              <span className="text-[10px] font-bold uppercase text-live tracking-wider">Live</span>
            </>
          )}
          <span className="text-[10px] uppercase font-bold tracking-wider text-neon">{room.category} Room</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{room.region}</span>
        </div>
        <h3 className="text-[15px] font-bold leading-snug mb-2">{room.title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{room.context}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {room.speakers.slice(0, 3).map((s) => (
                <img key={s.name} src={s.avatar} alt="" className="h-7 w-7 rounded-full border-2 border-card" />
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{formatN(room.listeners)}</span> listening
            </div>
          </div>
          <button className="px-4 py-1.5 rounded-full bg-neon text-neon-foreground text-xs font-bold neon-glow">
            <Mic className="h-3 w-3 inline -mt-0.5 mr-1" />Join
          </button>
        </div>
      </div>
    </Link>
  );
}

function DiscussionCard({ item }: { item: Extract<FeedItem, { kind: "discussion" }> }) {
  return (
    <article className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <img src={item.avatar} alt="" className="h-7 w-7 rounded-full" />
        <div className="text-xs">
          <div className="font-semibold leading-tight">{item.author}</div>
          <div className="text-[10px] text-muted-foreground">{item.region} · Discussion</div>
        </div>
      </div>
      <h3 className="text-[15px] font-bold leading-snug mb-1.5">{item.title}</h3>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.preview}</p>
      <div className="rounded-xl bg-secondary px-3 py-2 mb-3 text-xs text-foreground border-l-2 border-neon">
        {item.topComment}
      </div>
      <ActionRow likes={item.reactions} comments={item.replies} />
    </article>
  );
}

function EventCard({ item }: { item: Extract<FeedItem, { kind: "event" }> }) {
  return (
    <article className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="relative h-32">
        <img src={item.image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-card/90 text-[10px] font-bold uppercase tracking-wider">
          <Calendar className="h-2.5 w-2.5 inline -mt-0.5 mr-1" />Event
        </span>
      </div>
      <div className="p-4">
        <h3 className="text-[15px] font-bold leading-snug mb-1">{item.title}</h3>
        <div className="text-xs text-muted-foreground mb-3">{item.date} · {item.location}</div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            <Users className="h-3 w-3 inline mr-1" />
            <span className="font-semibold text-foreground">{formatN(item.attendees)}</span> going
          </div>
          <button className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-bold">RSVP</button>
        </div>
      </div>
    </article>
  );
}

function OpportunityCard({ item }: { item: Extract<FeedItem, { kind: "opportunity" }> }) {
  return (
    <article className="rounded-2xl bg-gradient-to-br from-accent to-card border border-border p-4">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neon">
        Opportunity · {item.region}
      </span>
      <h3 className="text-[15px] font-bold leading-snug mt-1.5 mb-1">{item.title}</h3>
      <div className="text-xs text-muted-foreground mb-1">{item.org}</div>
      <div className="text-xs font-semibold mb-3">{item.type}</div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-live font-semibold">{item.deadline}</span>
        <button className="px-4 py-1.5 rounded-full bg-neon text-neon-foreground text-xs font-bold">Apply</button>
      </div>
    </article>
  );
}

function NewsCard({ item }: { item: Extract<FeedItem, { kind: "news" }> }) {
  return (
    <article className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider">
        <Newspaper className="h-3 w-3 text-neon" />
        <span className="text-neon">Verified News</span>
        {item.trending && (
          <>
            <span className="text-muted-foreground">·</span>
            <TrendingUp className="h-3 w-3" />
            <span>Trending</span>
          </>
        )}
      </div>
      <h3 className="text-[15px] font-bold leading-snug mb-1.5">{item.title}</h3>
      <div className="text-xs text-muted-foreground mb-3">{item.source} · {item.region}</div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <MessageCircle className="h-3 w-3 inline mr-1" />
          {formatN(item.comments)} in discussion
        </span>
        <button className="px-3 py-1.5 rounded-full bg-secondary text-foreground text-xs font-bold">Open room</button>
      </div>
    </article>
  );
}

function ActionRow({ likes, comments }: { likes: number; comments: number }) {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <button className="flex items-center gap-1.5"><Heart className="h-4 w-4" /> {formatN(likes)}</button>
      <button className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {formatN(comments)}</button>
      <button className="flex items-center gap-1.5 ml-auto"><Share2 className="h-4 w-4" /></button>
    </div>
  );
}

function formatN(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return n.toString();
}
