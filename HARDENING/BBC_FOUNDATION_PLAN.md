# BBC FOUNDATION PLAN
**Date:** 2026-06-08  
**Scope:** BBC (Blanchard Blanquette Code) integration across the Loop platform  
**Source:** `bbc-core/BBC_SPEC_V1.md`, `bbc-core/schema/bbc.ts`, `bbc-core/AGENT_REGISTRY.md`  
**Authority:** BBC is the canonical operating standard for all LILCKY STUDIO LIMITED products per BBC_SPEC_V1

---

## What BBC Is

BBC is not a feature. It is the intelligence layer that makes Loop distinctly African.

> **Meaning is primary. Language is secondary.**

A user saying "e don do" (Pidgin) and a user saying "it's over" (English) and a user saying "o ti tan" (Yoruba) mean the same thing in a room context. BBC recognises this. No other audio platform built for Africa does.

BBC is simultaneously:
1. **Linguistic** — Meaning extraction before language processing
2. **Voice-first** — Hold-to-Talk as the default interaction mode
3. **Cultural** — Regional and dialectal context shapes interpretation
4. **Trust** — Every assertion carries a computed trust score
5. **Memory** — WIZMAC stores institutional knowledge permanently
6. **Agent** — SEKANI orchestrates all AI agents

---

## Current BBC State

| Component | Repo | Status | What It Has |
|-----------|------|--------|-------------|
| BBC Core | `bbc-core` | 🟡 Spec written | `BBC_SPEC_V1.md`, `schema/bbc.ts`, `AGENT_REGISTRY.md`, `VOICE_PIPELINE_SPEC.md` |
| BBC Schema | `bbc-core/schema/bbc.ts` | 🟡 Types defined | `Meaning`, `Intent`, `Language`, `Dialect`, `TrustScore`, `BBCRequest`, `BBCResponse` |
| WIZMAC | `wizmac-core` | 🟡 Foundation | 53KB — Knowledge graph schema, memory model |
| SEKANI | `sekani-core` | 🟡 Foundation | 53KB — Agent routing layer |
| Voice Pipeline | `bbc-core/specs/VOICE_PIPELINE_SPEC.md` | 🟡 Spec only | No implementation |
| Loop Integration | `loop` | ❌ None | BBC not referenced anywhere in the loop repo |
| AI Providers | `rald-ai` | 🟡 Partial | 19KB — commentary, moderation, recommendations, translation services |

**Gap:** BBC is specified and architecturally designed. It is not connected to Loop's user-facing features.

---

## The 9-Stage BBC Pipeline (from BBC_SPEC_V1)

```
INPUT (Voice or Text)
  ↓
[1] Language Detection      — Detect language, dialect, accent
  ↓
[2] Meaning Engine          — Extract canonical meaning (language-independent)
  ↓
[3] Intent Engine           — Classify intent: query / request / command / statement
  ↓
[4] Trust Engine            — Compute trust score for the request
  ↓
[5] Verification Engine     — Verify claimed entities and facts
  ↓
[6] Agent Routing (SEKANI)  — Route to: SEKANI / WIZMAC / FOUR / MIKA / BUTCHERS / MERMAC / DRAGULA
  ↓
[7] Model Selection         — Translation → Gemini | Reasoning → Claude | Conversation → GPT | Bulk → DeepSeek
  ↓
[8] Response Generation     — Generate output
  ↓
[9] WIZMAC Memory Storage   — Store all interactions permanently
```

---

## Phase Plan: BBC into Loop

This plan integrates BBC incrementally — starting with what delivers user value immediately, not with full compliance from day one.

---

### Phase 1: Language Intelligence (Week 1–2)
*Immediate user value. No backend required for basic detection.*

**Goal:** Loop knows which language each room is in. The UI reflects this.

**1.1 — Room language declaration**  
In room creation (`loop/artifacts/loop/src/pages/create.tsx`), the host declares the primary language(s):
```
Language: [Yoruba] [English] [Pidgin] [Igbo] [Hausa]
(select up to 2)
```
This is already partially implemented — `language` field exists on `Room` type.

**1.2 — Language filter in discovery**  
In `loop/artifacts/loop/src/pages/discover.tsx`, allow filtering rooms by language.  
"Show me rooms in Yoruba and Pidgin" — single tap.

**1.3 — BBC Language Detection in room title**  
When a host types a room title, call a lightweight BBC language detection:
```typescript
// BBC Stage 1 — client-side using existing rald-ai worker
const { language, confidence } = await detectLanguage(roomTitle)
if (confidence > 0.8) {
  // Suggest: "This looks like a Yoruba room. Set language to Yoruba?"
}
```
Uses `rald-ai/src/services/translation.ts` (already built).

---

### Phase 2: AI Room Intelligence (Week 3–4)
*Makes rooms feel smarter. Creates content the user wants to share.*

**Goal:** Every room gets an AI summary after it ends.

**2.1 — Room summary (BBC Stages 2–8)**  
The `Room` type already has `ai_summary: string | null`.  
The Cloudflare Worker already has an AI integration (`room_session` binding in `HealthResponse`).

Wire the room summary generation:
```typescript
// loop/artifacts/cloudflare-worker/src/services/commentary.ts (already exists)
// Called via ctx.waitUntil() when room ends

export async function generateRoomSummary(env: Env, room: Room): Promise<string> {
  // 1. Collect: room title, category, language, duration, speaker count
  // 2. Call BBC pipeline (Stage 2: extract meaning from room context)
  // 3. Call Workers AI (llama-3.1-8b-instruct) with BBC-structured prompt
  // 4. Store result in room.ai_summary via Supabase
  // 5. Show on room end screen: "This room discussed X and Y"
}
```

**2.2 — Room content moderation (BBC Stage 4: Trust Engine)**  
`rald-ai/src/services/moderation.ts` already exists. Wire it to:
- Room title on creation (pre-moderation)
- User bios on profile update  
Trust score from moderation feeds into the RALD Trust Center (`rald-trust`).

**2.3 — Personalised room recommendations (BBC Stage 3: Intent)**  
`rald-ai/src/services/recommendations.ts` exists.  
Input: user's language, region, communities, rooms_joined history.  
Output: 3 recommended rooms on the discover page.

---

### Phase 3: Voice Intelligence (Week 5–8)
*The core BBC proposition. Voice is the primary interface for Loop.*

**Goal:** Hold-to-Talk becomes a BBC-powered interaction, not just a mic toggle.

**3.1 — BBC Voice Pipeline for room interaction**

Per `bbc-core/specs/VOICE_PIPELINE_SPEC.md`:
```
User holds mic button
  → Record audio (Web Audio API / getUserMedia)
  → Send to BBC Stage 1: Language Detection (Cloudflare Workers AI `whisper` model)
  → BBC Stage 2: Meaning Extraction
  → If intent is "raise hand" or "request to speak" → trigger role change
  → If intent is "report user" → open report flow
  → Otherwise → broadcast audio normally via LiveKit
```

The magic here: a user saying "I want to speak" in Yoruba triggers the same raise-hand action as saying "can I speak" in English. BBC makes this happen.

**3.2 — Real-time transcription (opt-in)**  
For deaf and hard-of-hearing users, and for users on data-only connections who can't receive audio:
```
Speaker is talking
  → Cloudflare Workers AI (whisper) → BBC Stage 1 (language detect) → transcription
  → Subtitles shown to listeners who opted in
  → Stored in WIZMAC for room replay
```

**Implementation:** Cloudflare Workers AI `@cf/openai/whisper` is available in the existing Worker binding. No new service needed.

**3.3 — Hold-to-Talk UX hardening**  
Per BBC_SPEC_V1: Hold-to-Talk is the default interaction mode.  
Current: mic toggle (press once to mute, press once to unmute).  
BBC mandate: on mobile, default to Hold-to-Talk (hold for push-to-talk, release to stop broadcasting).  
Allow advanced users to switch to toggle mode in settings.  
This reduces accidental broadcasting and improves perceived audio quality.

---

### Phase 4: WIZMAC Memory (Week 8–12)
*Institutional memory. Loop gets smarter the more it's used.*

**Goal:** Loop remembers what happened. Users find their history. Communities accumulate knowledge.

**4.1 — Room memory in WIZMAC**  
After a room ends, store in WIZMAC (`wizmac-core`):
```typescript
{
  type: 'room_ended',
  roomId: room.id,
  title: room.title,
  language: room.language,
  summary: room.ai_summary,
  community: room.community_id,
  speakerIds: participants.filter(p => p.role === 'speaker').map(p => p.user_id),
  duration: room.duration,
  region: host.region,
  timestamp: now
}
```

This enables: "Show me all rooms about Afrobeats in Lagos in the last 30 days."

**4.2 — Community knowledge base**  
Each community accumulates a WIZMAC-backed knowledge graph:
- What topics has this community discussed?
- Who are the most active speakers?
- What time do rooms usually start?
- What languages are spoken?

Surfaces in community detail page: "This community usually meets Sundays at 8pm and speaks Yoruba + English."

**4.3 — User interest graph**  
WIZMAC builds a per-user interest graph from rooms joined, communities joined, and languages used.  
Feeds BBC Stage 3 (Intent) for personalised discovery.

---

### Phase 5: SEKANI Agent Layer (Week 12+)
*The full BBC pipeline. AI-powered room moderation, host assistance, and cross-language bridge.*

**Goal:** SEKANI becomes the Loop intelligence layer — proactively protecting rooms and helping hosts.

**5.1 — Proactive room moderation**  
SEKANI monitors room title, community, and participant behaviour.  
BBC Stage 4 (Trust Engine) flags rooms with anomalous behaviour.  
SEKANI routes to moderation agent (BUTCHERS) for review.

**5.2 — Host assistant**  
When a host creates a room, SEKANI (via BBC Stage 3: Intent) suggests:
- Optimal start time based on community activity patterns
- Suggested room title in the community's primary language
- Recommended co-host from the community's trusted speakers

**5.3 — Cross-language bridge**  
BBC Stage 7 (Model Selection) routes translation to Gemini.  
A user speaking Yoruba and a user speaking Swahili can understand each other through BBC.  
First in audio (subtitles). Later: real-time voice translation.

---

## BBC Compliance Checklist (Per BBC_SPEC_V1 §7)

> Every AI service in the RALD Ecosystem MUST:

```
[ ] 1. Pass all requests through BBC before model execution
        Current: rald-ai calls models directly. Must route through BBC pipeline.

[ ] 2. Extract meaning before classifying intent
        Current: Not implemented. Phase 2.2 begins this.

[ ] 3. Store all interactions in WIZMAC
        Current: Not implemented. Phase 4.1 begins this.

[ ] 4. Route through SEKANI for agent coordination
        Current: Not implemented. Phase 5 begins this.

[ ] 5. Never hardcode a single model provider
        Current: rald-ai/src/services/* use hardcoded Workers AI calls.
        Fix: Add model router per BBC §7 rule 5.
        Model router logic from BBC_SPEC_V1:
          Translation → Gemini
          Reasoning   → Claude
          Conversation → GPT
          Bulk         → DeepSeek
          Internal     → RALD Models (future)

[ ] 6. Support voice as the primary input mode
        Current: mic toggle only. Phase 3.1 implements Hold-to-Talk.

[ ] 7. Log trust scores for all assertions
        Current: Not implemented. Required for rald-trust integration.
```

---

## Language Support Roadmap (from BBC_SPEC_V1 §6)

| Phase | Languages | Target | Loop Implementation |
|-------|-----------|--------|---------------------|
| Phase 1 | English, Pidgin | ✅ Live | Room creation + filters |
| Phase 2 | Yoruba, Igbo, Hausa | 2026 Q3 | Whisper transcription + UI labels |
| Phase 3 | Swahili, Twi, Zulu, Amharic | 2026 Q4 | BBC language detection |
| Phase 4 | 20+ African languages | 2027 | BBC meaning extraction trained on African corpus |
| Phase 5 | 100+ African languages | 2028 | — |
| Phase 6 | 1000+ dialects | 2029+ | — |

**Q3 2026 target:** Yoruba, Igbo, Hausa rooms with Whisper transcription is achievable with Cloudflare Workers AI — no new services required.

---

## BBC Integration Priority

```
Immediate — Delivers user value, no architecture required
[ ] Phase 1.1: Room language declaration in create flow
[ ] Phase 1.2: Language filter in discover page
[ ] Phase 2.2: Room title moderation via rald-ai on creation

Sprint — Requires worker updates
[ ] Phase 2.1: AI room summary on room end (ai_summary field already in DB)
[ ] Phase 2.3: Personalised recommendations on discover page
[ ] Phase 3.3: Hold-to-Talk as default on mobile

Architecture Sprint — New services, BBC compliance
[ ] Phase 3.1: BBC Voice Pipeline (language detect → intent → route)
[ ] Phase 1.3: Language detection in room title
[ ] Phase 4.1: WIZMAC room memory

Long-term — Full BBC pipeline
[ ] Phase 5.1: SEKANI proactive moderation
[ ] Phase 4.2: Community knowledge base
[ ] Phase 5.3: Cross-language voice bridge
```

---

*Prepared for LILCKY STUDIO LIMITED — Loop Hardening Directive — 2026-06-08*
