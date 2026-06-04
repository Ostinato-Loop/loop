// Loop — Launch Mock Data
// Used for UI/UX demonstration until real API connections are wired.
// Mirrors the data shapes from rald-auth-core and the Loop audio engine.
// LILCKY STUDIO LIMITED

export type Region = { city: string; state: string; country: string };

export const userRegion: Region = { city: "Lagos", state: "Lagos State", country: "Nigeria" };

export type Room = {
  id: string;
  title: string;
  category: string;
  region: string;
  live: boolean;
  listeners: number;
  speakers: { name: string; avatar: string }[];
  context: string;
  trending?: boolean;
};

export const rooms: Room[] = [
  {
    id: "lagos-traffic",
    title: "Lagos Traffic Reform: What's actually working?",
    category: "Civic",
    region: "Lagos",
    live: true,
    listeners: 4821,
    speakers: [
      { name: "Adaeze O.", avatar: "https://i.pravatar.cc/100?img=47" },
      { name: "Tunde A.", avatar: "https://i.pravatar.cc/100?img=12" },
      { name: "Ngozi I.", avatar: "https://i.pravatar.cc/100?img=23" },
    ],
    context: "LASTMA commissioner Q&A live. 38 speakers in queue.",
    trending: true,
  },
  {
    id: "afrobeats",
    title: "Afrobeats Room — Album of the Year debate",
    category: "Music",
    region: "Africa",
    live: true,
    listeners: 20413,
    speakers: [
      { name: "DJ Kemi", avatar: "https://i.pravatar.cc/100?img=32" },
      { name: "Wale B.", avatar: "https://i.pravatar.cc/100?img=15" },
    ],
    context: "Rema vs Asake vs Tems. Heated.",
    trending: true,
  },
  {
    id: "super-eagles",
    title: "Super Eagles tactical breakdown",
    category: "Sports",
    region: "Nigeria",
    live: true,
    listeners: 7102,
    speakers: [
      { name: "Coach E.", avatar: "https://i.pravatar.cc/100?img=68" },
      { name: "Ife S.", avatar: "https://i.pravatar.cc/100?img=44" },
    ],
    context: "AFCON prep. Lineup predictions.",
  },
  {
    id: "unilag",
    title: "University of Lagos — Hostel allocation 2026",
    category: "Campus",
    region: "Lagos",
    live: false,
    listeners: 1240,
    speakers: [{ name: "SUG Pres.", avatar: "https://i.pravatar.cc/100?img=5" }],
    context: "Top comment: 'Why is Mariere closed again?' — 412 replies.",
  },
  {
    id: "kenya-tech",
    title: "Nairobi devs: hiring market right now",
    category: "Business",
    region: "Kenya",
    live: true,
    listeners: 982,
    speakers: [{ name: "Wanjiku", avatar: "https://i.pravatar.cc/100?img=26" }],
    context: "Open roles from 14 startups. Salaries shared.",
  },
  {
    id: "amapiano",
    title: "Amapiano Sundays — log-drum masterclass",
    category: "Music",
    region: "South Africa",
    live: false,
    listeners: 5210,
    speakers: [{ name: "Kabza V.", avatar: "https://i.pravatar.cc/100?img=33" }],
    context: "Replay highlights. 38 saved clips.",
  },
];

export type FeedItem =
  | { kind: "room"; room: Room }
  | { kind: "discussion"; id: string; title: string; author: string; avatar: string; region: string; replies: number; reactions: number; preview: string; topComment: string }
  | { kind: "event"; id: string; title: string; date: string; location: string; attendees: number; image: string; region: string }
  | { kind: "opportunity"; id: string; title: string; org: string; type: string; deadline: string; region: string }
  | { kind: "news"; id: string; title: string; source: string; region: string; comments: number; trending: boolean };

export const feed: FeedItem[] = [
  { kind: "room", room: rooms[0] },
  { kind: "news", id: "n1", title: "CBN announces new FX policy — markets react", source: "Verified · Premium Times", region: "Nigeria", comments: 1284, trending: true },
  { kind: "discussion", id: "d1", title: "Why is rent in Lekki up 80% this year?", author: "Chioma O.", avatar: "https://i.pravatar.cc/100?img=49", region: "Lagos", replies: 312, reactions: 2104, preview: "Landlords are pricing in dollars but salaries are naira. We need a serious conversation about this…", topComment: '"Real estate is the new oil scam." — 412 likes' },
  { kind: "room", room: rooms[1] },
  { kind: "event", id: "e1", title: "Lagos Tech Fest 2026", date: "Sat 14 Feb · 10:00", location: "Landmark Centre, V.I.", attendees: 3211, image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=70", region: "Lagos" },
  { kind: "opportunity", id: "o1", title: "MTN Pulse Scholarship 2026", org: "MTN Foundation", type: "Scholarship · ₦500k", deadline: "Closes in 12 days", region: "Nigeria" },
  { kind: "room", room: rooms[2] },
  { kind: "discussion", id: "d2", title: "Top moments from yesterday's Afrobeats Room", author: "Loop Highlights", avatar: "https://i.pravatar.cc/100?img=66", region: "Africa", replies: 88, reactions: 4500, preview: "AI extracted the 5 sharpest takes from a 4-hour session. Tap to listen.", topComment: '"Asake\'s bridge work is criminally underrated." — 980 likes' },
];

export const categories = [
  { id: "civic",         label: "Civic",         emoji: "🏛️" },
  { id: "music",         label: "Music",         emoji: "🎧" },
  { id: "sports",        label: "Sports",        emoji: "⚽" },
  { id: "campus",        label: "Campus",        emoji: "🎓" },
  { id: "business",      label: "Business",      emoji: "💼" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "tech",          label: "Tech",          emoji: "💻" },
  { id: "creators",      label: "Creators",      emoji: "✨" },
];

export type Person = {
  handle: string;
  name: string;
  avatar: string;
  region: string;
  bio: string;
  verified?: boolean;
  metVia?: string;
};

export const people: Person[] = [
  { handle: "adaeze", name: "Adaeze Okafor", avatar: "https://i.pravatar.cc/100?img=47", region: "Lagos", bio: "Civic tech · Urban planning", verified: true, metVia: "Met in Lagos Traffic Room" },
  { handle: "tunde",  name: "Tunde Abiola",  avatar: "https://i.pravatar.cc/100?img=12", region: "Lagos", bio: "Engineer · Open source", verified: true },
  { handle: "wanjiku", name: "Wanjiku M.",   avatar: "https://i.pravatar.cc/100?img=26", region: "Nairobi", bio: "Founder · Women in Tech", metVia: "Met in Nairobi Devs Room" },
  { handle: "ngozi",  name: "Ngozi Ibe",     avatar: "https://i.pravatar.cc/100?img=23", region: "Abuja", bio: "Policy · Law" },
  { handle: "djkemi", name: "DJ Kemi",        avatar: "https://i.pravatar.cc/100?img=32", region: "Lagos", bio: "Music producer · Afrobeats", verified: true },
  { handle: "kabza",  name: "Kabza V.",       avatar: "https://i.pravatar.cc/100?img=33", region: "Johannesburg", bio: "Amapiano · log-drum" },
];

export const me = {
  name: "Adaeze Okafor",
  handle: "adaeze",
  avatar: "https://i.pravatar.cc/100?img=47",
  region: "Lagos, Nigeria",
  bio: "Civic tech enthusiast. Urban planning nerd. Building the city Lagos deserves.",
  followers: 4200,
  following: 312,
  trust: 92,
};
