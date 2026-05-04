# Build Plan — Cold Email Agent

A step-by-step plan for building the cold email agent, derived from `user-flow.md` and `ui-screens.md`. The order is **build-backwards from the demo**: start with the riskiest integration (sending a real email), then layer the UI and intelligence on top.

The phases below are ordered so that **each one is demoable on its own**. If you have to stop after Phase 3, you still have something that works end-to-end with hardcoded data.

---

## Quick orientation (read this first if any of the stack is new)

You're building a **Next.js App Router** app deployed on **Vercel**. A few things worth knowing up front so the rest reads smoothly:

- **App Router** means folders in `app/` become URLs. `app/chat/[chatId]/page.tsx` → the page at `/chat/<some-id>`. Square brackets = dynamic, the value gets passed in as a prop.
- **API routes** are just files under `app/api/` that export `GET`, `POST`, etc. They run as serverless functions on Vercel — no separate backend to deploy.
- **shadcn/ui** is not a library you `npm install`. It's a CLI that copies React component source files into your repo. You own the code, so when you need to tweak the `Button` you just edit it.
- **Vercel KV** is hosted Redis. Treat it as a tiny key-value DB: `kv.set('profile:abc', {...})`, `kv.get('profile:abc')`. No schemas, no migrations.
- **NextAuth** does the Google sign-in dance for you. After login it gives you a session cookie and (because we asked for the `gmail.send` scope) an access token you can use to send mail on the user's behalf.
- **Vercel AI SDK** (the `useChat` hook + AI Gateway) handles the streaming-tokens-into-the-UI pattern. You don't write that plumbing yourself.

If something below assumes one of these and it doesn't click, come back here.

---

## Performance baseline — what "fast first load" actually means

Before the phases, let's nail down what we're optimizing for. "Fast" is a fuzzy word, and in Next.js it actually means several distinct things, each fixed by different techniques:

- **TTFB (Time to First Byte)** — how long the server takes to start sending HTML. Killed by slow database calls in the page render path, or by serverless cold starts.
- **FCP (First Contentful Paint)** — when the user sees *anything*. Killed by render-blocking CSS, custom fonts that haven't downloaded, and heavy client JavaScript that runs before paint.
- **LCP (Largest Contentful Paint)** — when the main content (usually a hero image or headline) is visible. Killed by big unoptimized images and by client-side data fetches that delay the main element.
- **TTI (Time to Interactive)** — when buttons actually respond. Killed by big JS bundles that take time to download and parse.
- **Cold starts** — first request after your serverless function has been idle takes 1–3s longer. Mostly an issue for routes with lots of dependencies (the streaming chat route is the main offender).

The principles below apply to every phase. **Treat them as defaults, not extras.** It is much cheaper to bake performance in now than to retrofit later.

### The seven defaults that matter most

1. **Pick the right rendering mode per page.** Not every page needs the same treatment:
   - **Landing page (`/`)** → fully static (SSG). It has no per-user data. Mark it with `export const dynamic = 'force-static'` and Vercel will serve it from the CDN edge — no server work per visit, sub-100ms TTFB globally.
   - **Onboarding (`/onboarding`)** → static shell, dynamic where needed. The form itself is static; the upload action is a server route.
   - **Chat app (`/chat/[chatId]`)** → server-rendered (SSR), but with **streaming**. We render the shell immediately and stream chat history in. App Router does this naturally with React Server Components + `Suspense` — the user sees the sidebar before KV has even returned the chat history.

2. **Fonts: use `next/font`, not a `<link>` tag.** `next/font/local` (or `next/font/google`) self-hosts the font, inlines the CSS, and serves it with the right `font-display: swap` — zero layout shift, zero third-party request, FCP wins for free. Geist is already shipped this way by Vercel.

3. **Code-split aggressively, especially the heavy bits.** Anything the user doesn't need on first paint should be `dynamic()`-imported:
   - `canvas-confetti` — only loads when the user is about to send. Saves ~15 KB on every page that doesn't need it.
   - `framer-motion` — only the chat page needs the tone-switch animation. The landing page should not pull this in.
   - The PDF parser (`pdf-parse`) — server-only, never ships to the client. Make sure it's only imported inside an API route, never from a `'use client'` file.
   - The draft card component — `dynamic(() => import('@/components/DraftCard'), { ssr: false })` if you want it to skip SSR (it's interactive-only anyway, no SEO value).

4. **Images: use `next/image`, always.** It does srcset, lazy loading, AVIF/WebP conversion, and prevents layout shift via the explicit `width`/`height` props. The five-step icon row on the landing page should be `next/image` or inline SVGs (SVGs are usually smaller and don't even need optimization).

5. **Tree-shake icon imports.** `import { Mail } from 'lucide-react'` is fine — `lucide-react` is per-icon-treeshakable. **Don't** ever do `import * as Icons from 'lucide-react'` (would balloon your bundle by ~200 KB). Same rule for `react-icons`.

6. **Cache in front of every external API.** Apollo and Claude responses are expensive AND slow. Cache wherever you can:
   - Apollo lookups → cache by filter signature for 24h. Same query twice = one round trip.
   - Profile reads → cache in memory at the request level (use React's `cache()` wrapper) so multiple components in the same render tree don't all hit KV.
   - Static landing page assets → already cached by Vercel's CDN, but make sure you're not accidentally opting out by reading cookies in the layout.

7. **Avoid serverless cold starts on the hot path.** The `POST /api/chats/:chatId/messages` route is the most-used route and the one most affected by cold starts. Two mitigations:
   - **Use the Edge runtime** for streaming routes: `export const runtime = 'edge'`. Edge functions have ~10x faster cold starts than Node serverless functions and stream natively.
   - **Don't import giant libraries into hot routes.** A single `import { google } from 'googleapis'` at the top of a streaming route will add ~500ms to its cold start. Move Gmail sending to its own route (`/api/drafts/:id/send`) — which is already in the plan — and keep the streaming route lean.

### The Lighthouse-score-protectors

Things to do once, near the start, that prevent regressions:

- **Add `@next/bundle-analyzer`** in Phase 0. Run it before each phase ships and skim the output. If a route's bundle suddenly jumped 100 KB, you'll see why.
- **Set up Vercel Analytics** (free tier) and Real User Monitoring. It shows you actual TTFB/FCP/LCP from real visitors, not synthetic Lighthouse runs. Critical for catching the "works on my fast laptop" problem.
- **Define a budget upfront.** Targets for the demo:
  - Landing page: LCP under 1.5s, JS under 100 KB gzipped
  - Chat app first paint: under 1s (sidebar visible, thread streams in)
  - Streaming first token: under 1.5s after the user hits Enter
- **Lighthouse CI in GitHub Actions** is overkill for an MVP, but `lighthouse https://your-url` from the terminal once per phase is not. Five minutes well spent.

I'll call out the perf-relevant pieces inside each phase below so you don't have to flip back to this section.

---

## Phase 0 — Project setup (Day 1, ~2 hours)

Goal: get a "hello world" Next.js app deployed on Vercel and confirm the pipeline works. This phase exists purely to de-risk deployment before you write anything important.

**Tasks:**
1. `npx create-next-app@latest` with TypeScript, Tailwind, and App Router enabled.
2. Push to GitHub, connect to Vercel, deploy. Visit the live URL — confirm it works.
3. Initialize shadcn: `npx shadcn@latest init`. Accept defaults but use **Slate** as the base color.
4. Install the components from the checklist in `ui-screens.md`:
   ```
   npx shadcn@latest add button card input textarea label badge avatar \
     scroll-area separator alert dialog dropdown-menu tooltip skeleton sonner
   ```
5. Install the npm dependencies:
   ```
   npm install lucide-react react-icons framer-motion canvas-confetti @ai-sdk/react ai
   npm install next-auth @vercel/kv
   ```
6. Set up dark mode with `next-themes`. Confirm a toggle works on a throwaway page.
7. In `app/globals.css` and `tailwind.config.ts`: set the CSS variable `--primary` to a bright blue (Tailwind `blue-600`) and `--ring` to `blue-500`. This is the central "make CTAs pop" rule from `ui-screens.md`.

**Perf setup to do right now (cheap, prevents regressions later):**
8. Install the bundle analyzer: `npm install -D @next/bundle-analyzer`. Wire it into `next.config.js`. Run with `ANALYZE=true npm run build` — it opens a visual treemap of your bundles. Skim it after each phase.
9. Enable Vercel Analytics in the project dashboard. Two clicks. It records real-user TTFB/FCP/LCP from visitors so you can spot regressions in the wild.
10. Set up `next/font` with Geist Sans + Geist Mono in `app/layout.tsx` (Geist is already shipped by Vercel as a self-hosted font — `next/font/local` style). This locks in zero-layout-shift fonts on day one.

**Done when:** the deployed site loads, dark mode toggles, a default shadcn `Button` shows up bright blue, and `ANALYZE=true npm run build` produces a bundle treemap.

---

## Phase 1 — Send a real email via Gmail (Day 1–2, ~4 hours)

This is the riskiest integration in the whole project. Nail it before anything else. Everything else (UI, agent, Apollo) is downstream of "can we actually send the email?"

**Tasks:**
1. **Set up NextAuth with Google.**
   - Create a Google Cloud OAuth client (web application). Add `https://<your-vercel-url>/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google` as authorized redirect URIs.
   - Configure `app/api/auth/[...nextauth]/route.ts` with the Google provider.
   - **Critically**, request these scopes: `openid`, `email`, `profile`, **and** `https://www.googleapis.com/auth/gmail.send`. The Gmail scope is what lets you send mail later.
   - In the NextAuth callback, persist the `access_token` and `refresh_token` to the JWT/session so backend routes can read it.
2. **Build a throwaway test page** at `/test-send` with a hardcoded recipient, subject, and body, plus a single "Send" button.
3. **Build the send route** at `app/api/drafts/[id]/send/route.ts`. For now it can ignore the `id` and use hardcoded content. Inside it:
   - Get the user's session via `getServerSession`.
   - Pull the Gmail access token off the session.
   - Construct the email as a base64url-encoded RFC 822 message.
   - POST to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with `Authorization: Bearer <token>`.
4. Sign in, hit the button, send an email to yourself. Confirm it arrives in your inbox (not spam).

**Perf note:** **Don't import `googleapis`** for this. It's a ~5 MB package that includes every Google service. Just use `fetch` directly against the Gmail REST API — three lines, no dependency, ~500ms shaved off this route's cold start. If you want a tiny helper for building the MIME blob, `nodemailer` (which you only use server-side to construct the message string, not to actually send) is the lightest option.

**Why this matters now:** OAuth scopes, MIME formatting, and Gmail's API quirks are the kind of thing that eats a day if you discover them late. Discover them now while there's nothing else to break.

**Done when:** clicking a button on a logged-in page reliably delivers an email to your own Gmail inbox.

---

## Phase 2 — The draft card UI with arrow navigation (Day 2–3, ~6 hours)

Build the visual centerpiece — the three-tone draft card — with **hardcoded** drafts. No AI yet, no Apollo. The goal is to make the tone-switching feel great so the demo lands.

**Tasks:**
1. Create a `/draft-preview` page (throwaway, just for building this in isolation).
2. Hardcode three drafts in an array: `[{ tone: 'casual', subject, body, contact }, { tone: 'professional', ... }, { tone: 'efficient', ... }]`.
3. Build the **draft card component** matching Screen 4 in `ui-screens.md`:
   - ~600px wide `Card`, centered, subtle shadow, `rounded-xl`.
   - **Top:** three pill tabs (Casual / Professional / Efficient). Active tab = `slate-900` background with a small bright-blue dot.
   - **Contact header row:** avatar (colored initial), name (bold), title-at-company (slate-500), email in Geist Mono on the right with a tiny lock icon.
   - **Subject:** uppercase slate-500 "Subject" label + a single-line `Input`.
   - **Body:** uppercase slate-500 "Email" label + a `Textarea` (~10 rows).
   - **Tone pill in the corner** of the body area: tiny `Badge` reading e.g. `Casual · ~95 words`.
   - **Arrow nav graphic** below body: `[←]  ●  ○  ○  [→]`. Active dot is filled `blue-600`, inactive are outlined `slate-300`. Tiny "Use ← → to switch tones" caption underneath.
   - **Action row:** ghost "Discard chat" button on the left, primary blue "Send email" with a paper-airplane icon on the right.
4. Wire up the keyboard shortcuts: a `useEffect` hook that listens for `ArrowLeft`/`ArrowRight` and changes the active tone index.
5. Wire up the click handlers: clicking the arrow buttons or the tabs also changes the index.
6. **The animation.** Use Framer Motion's `AnimatePresence` and `motion.div`. When the index changes, the current draft slides off horizontally with a slight fade, and the new one slides in from the opposite side. Tune to ~250ms — too slow is boring, too fast is invisible.
7. Inline editing: subject and body should be editable. For now just keep it in local state; persistence comes in Phase 4.
8. Wire the "Send email" button to the route from Phase 1. Sending the active draft should fire off a real Gmail.

**Perf notes for this phase:**
- **Lazy-load `framer-motion`** — only import it inside the draft card component, not in any layout. The component itself is `'use client'`, but make sure no parent server component pulls it in.
- **Lazy-load `canvas-confetti`** with `dynamic(() => import('canvas-confetti'), { ssr: false })`. It only fires on send — there's no reason for it to ship in the initial bundle. Save ~15 KB.
- **The polish bit (`ui-screens.md` calls this out specifically):** the arrow graphic should pulse subtly when keys are pressed. A CSS transform (`transition: transform 100ms; transform: scale(1.1)`) is cheaper than a Framer Motion variant for this — use plain CSS where you can.

**Done when:** you can arrow through three drafts with smooth animations, edit the body inline, and click Send to actually deliver the email.

---

## Phase 3 — The chat layout (sidebar + active chat) (Day 3–4, ~5 hours)

Build the ChatGPT-style two-column shell with **hardcoded** chats and messages. The agent comes in Phase 5.

**Tasks:**
1. Create `app/chat/[chatId]/page.tsx`. The route is dynamic — `chatId` is just a URL slug for now, no real data behind it.
2. **Two-column layout.** Full viewport height. Sidebar fixed at ~260px wide on the left, main content flex-fills the right.
3. **Sidebar (Screen 3 left side in `ui-screens.md`):**
   - Background `slate-100` (light) / `slate-950` (dark) — slightly darker than the chat area, gives depth.
   - Top: full-width primary blue "+ New chat" button.
   - Middle: hardcoded list of fake chats with status dots and an active-row highlight (2px bright-blue left border).
   - Bottom: avatar + name + chevron with a `DropdownMenu`.
4. **Main chat area (Screen 3 right side):**
   - **Top context strip** (~50px): four small `Badge`s in a row — Role / Company size / Industry / Location.
   - **Middle thread area** (`ScrollArea`) with user/agent message styles.
   - **Bottom input row:** auto-growing `Textarea` + circular blue send button.
5. Embed the draft-card component from Phase 2 as a special inline message inside the thread.
6. **Empty sidebar state:** small icon + "No chats yet. Start one above."

**Perf notes for this phase (this is where SSR + streaming pays off the most):**
- **Make the chat layout a Server Component, not a Client Component.** Only the input box and the message list need `'use client'`. The sidebar shell, the context strip skeleton, the page chrome — all server. This means the HTML lands in the browser fully formed; the user sees the layout *before* any JS runs.
- **Use `Suspense` boundaries for the sidebar list and the thread.** Wrap the chat list in `<Suspense fallback={<SidebarSkeleton />}>`. The shell renders instantly, the chat list streams in when KV responds. Same for the thread. This is a free win in App Router — it's literally just wrapping a component.
- **`ScrollArea` is reasonably light, but be careful with very long threads.** If a chat has 100+ messages, virtualize the list (use `react-virtual` or `react-window`). For the MVP demo with short chats this isn't needed, but worth knowing the escape hatch exists.

**Done when:** the page looks like ChatGPT with the right palette, the layout shows up before any JS executes (test by disabling JS in devtools — the sidebar should still render), and the draft card from Phase 2 renders inline in the thread.

---

## Phase 4 — Persistence: Vercel KV + chat/draft routes (Day 4–5, ~5 hours)

Time to make things real. Set up Vercel KV and the API routes that the chat will hit.

**Tasks:**
1. **Provision Vercel KV** from the Vercel dashboard. Add the env vars to your local `.env.local`.
2. **Define the data shapes** in `lib/types.ts` matching the `user-flow.md` KV section.
3. **Build the API routes:**
   - `GET /api/chats` — list the current user's chats for the sidebar.
   - `POST /api/chats` — create a new chat.
   - `GET /api/chats/:chatId` — return one chat's full message history.
   - `PATCH /api/drafts/:id` — update a draft's subject/body. Increment `editCount`, set `firstEditAt` if not set, always update `lastEditAt`.
   - Update the existing `POST /api/drafts/:id/send` to load the draft from KV.
4. **Wire the sidebar to the real data.** Use a `Skeleton` placeholder while loading.
5. **Wire the "+ New chat" button** to `POST /api/chats`, then `router.push(/chat/${newId})`.
6. **The `/chat` router:** create `app/chat/page.tsx` that, on the server, looks up the user's most recent chat and either redirects to it or creates a new one.
7. **Auto-save on edit:** debounce subject/body changes (~500ms) and PATCH to `/api/drafts/:id`. Show a tiny "Saved" text fading in for ~1s after each save.

**Perf notes for this phase (KV is fast, but it's a network call — small choices add up):**
- **Parallelize KV reads.** When `GET /api/chats` is fetching the chat list, don't `await` each chat in a loop — `Promise.all` them. KV responds in ~10ms; serialized calls turn that into 10ms × N chats.
- **Pipeline KV writes.** When sending a draft you update the draft record AND the chat record. Use Redis pipelining (`kv.pipeline()`) so both writes go in one round trip.
- **Wrap reads with React's `cache()`** for server components. If two server components both need the user's profile in the same request, `cache(getProfile)` ensures KV is hit once, not twice. Pure win, two lines of code.
- **Debouncing matters here.** The auto-save on edit fires on every keystroke if you're not careful. 500ms is a good default — fast enough to feel reliable, slow enough that "the lazy fox jumped" doesn't cause 22 KV writes.

**Done when:** you can create new chats, the sidebar reflects real data, edits to a draft persist across reload, and sending a draft actually marks it sent in KV.

---

## Phase 5 — The streaming agent + Apollo tool call (Day 5–6, ~6 hours)

The brain. This is where the chat becomes intelligent.

**Tasks:**
1. **Set up the AI Gateway** (or call Anthropic directly via the AI SDK).
2. **Build the streaming chat route** at `app/api/chats/[chatId]/messages/route.ts`. It:
   - Receives the user's new message.
   - Loads the chat history and user profile from KV.
   - Constructs a system prompt with the resume, additional context, and the "narrow toward one contact" instruction.
   - Calls Claude with `streamText`, with tools `find_contact` and `draft_emails`.
   - Streams the response back to the client.
3. **Wire the front-end with `useChat`** from `@ai-sdk/react`.
4. **Implement the `find_contact` tool handler** with the Apollo targeting rules: `companySize > 200` → senior eng managers, `companySize < 50` → founders, middle range → senior managers. Return exactly one contact.
5. **Render the contact card inline** with "Draft these" / "Find someone else" buttons.
6. **Render the status panel** with progressive checkmarks while Apollo runs and drafts generate.
7. **Implement the `draft_emails` tool.** Fire **three Claude calls in parallel** — one per tone — using the targets from `user-flow.md` (Casual ~80–120 words, Professional ~180–250 words, Efficient ~120–160 words).
8. Save each draft to `draft:{chatId}:{tone}`, surface them in the inline three-tone card.
9. **Apollo failure case:** destructive `Alert` inline in the chat.
10. **Auto-generate the chat title** from the first user message.

**Perf notes for this phase (this is the most performance-sensitive route in the app):**
- **Use the Edge runtime for the streaming route.** At the top of `route.ts`: `export const runtime = 'edge'`. Edge functions cold-start in ~50ms vs ~1500ms for Node serverless. They also stream natively without buffering. This is a huge win for "time to first token."
- **Keep the streaming route's imports lean.** Don't import `googleapis`, `pdf-parse`, or anything else heavy. The route should only need the AI SDK, `@vercel/kv`, and your own helpers. Run the bundle analyzer afterwards to verify.
- **Parallelize the three draft calls.** `Promise.all([draftCasual, draftProfessional, draftEfficient])`. Sequential = 3x slower, dramatically worse demo experience.
- **Stream tokens as they arrive** — don't wait for the full response. The AI SDK's `streamText` does this by default; just make sure you're returning the stream, not awaiting it to completion.
- **Cache Apollo lookups.** The same role+company+location query shouldn't hit Apollo twice. Hash the filter object → store the result in KV with `EX 86400` (24h expiry). For the demo this also saves your Apollo credits.

**Done when:** you can have a real conversation, the agent narrows down a target, Apollo finds one contact, three drafts get generated in parallel, and they appear in the inline draft card with the same UX you built in Phase 2 — and the time from "Enter pressed" to "first token visible" is under 1.5s.

---

## Phase 6 — The celebration moment (Day 6, ~2 hours)

The emotional payoff. Small phase, high impact for the demo.

**Tasks:**
1. When `POST /api/drafts/:id/send` succeeds:
   - Trigger a `canvas-confetti` burst — bright blue and slate confetti only.
   - Replace the active draft card with a smaller "sent" summary card.
   - Append a new agent message.
2. **The celebration text logic** uses the `editCount` and `firstEditAt`/`lastEditAt`:
   - Long edit session: *"Sent. That was a great one — you spent real time on it."*
   - Quick send: *"Sent. Clean and fast. Nice."*
3. **Lock the chat:** disable the input, `Tooltip` on hover. Sidebar status updates to "completed."
4. Show a `Sonner` toast: *"Email sent to jane@stripe.com"* — auto-dismisses after 3s.

**Perf note:** confetti is the one thing that absolutely must not be in the initial bundle. `dynamic(() => import('canvas-confetti'), { ssr: false })` and call it the first time a user clicks Send. The library is fine — it's just that 99% of page loads don't need it.

**Done when:** sending fires confetti, locks the chat, and the celebration message reflects edit behavior.

---

## Phase 7 — Onboarding (Day 6–7, ~3 hours)

Now that the core app works, build the gate that profiles the user before their first chat.

**Tasks:**
1. **Create `app/onboarding/page.tsx`** matching Screen 2.
2. **Build `POST /api/profile/resume`:** parses PDF (`pdf-parse`) or .docx (`mammoth`), returns text.
3. **Build `POST /api/profile`:** writes `profile:{userId}` to KV.
4. **Loading state:** spinner with "Setting up your profile…"
5. **Routing logic:** in middleware (or in `/chat/page.tsx`), check for `profile:{userId}` after login.

**Perf notes:**
- **The onboarding page itself is mostly static.** Make the form a Server Component with a small Client Component island for the file picker and textarea state. Saves bundle weight on a page that's only visited once per user.
- **`pdf-parse` is server-only.** Make sure it's only ever imported inside the API route. If it ends up in a client bundle by accident (it won't tree-shake cleanly), you'll ship hundreds of KB of PDF parsing code to every visitor.
- **Resume upload is the slowest action in the whole app.** Show optimistic UI: as soon as the file is selected, switch the button to "Setting up your profile…" with a spinner. Don't make the user wait at a static screen while the parse happens.

**Done when:** a brand-new user signing in lands on `/onboarding`, uploads a resume, and gets dropped into their first chat with the agent already aware of their background.

---

## Phase 8 — Landing page (Day 7, ~3–4 hours)

The marketing surface. Build last because nothing depends on it. **This page must be the fastest in the app** — it's the first impression and most visitors will bounce within 3 seconds if it's slow.

**Quick palette decision before you start:** pick slate+blue (recommended for MVP, matches the app) or cream+serif (matches the screenshots). Don't ping-pong.

**Sections to build (all on `/`):**

1. **Hero:** wordmark, large centered headline ~56px, slate-500 subheadline, the official Google sign-in button, "Free to try. No credit card." line.
2. **How it works:** 5-step horizontal row with chevron separators. Icons from `lucide-react`: `upload-cloud`, `message-square`, `target`, `sparkles`, `mail`.
3. **Live API surface (terminal block):** `slate-900` background, three macOS dots, four endpoint rows with colored HTTP methods. Use the routes from `user-flow.md`, not the older screenshot routes.
4. **Powered by tools you trust:** 4-column grid (Apollo, Claude Opus 4.5, Gmail API, Vercel KV).
5. **Final CTA:** *"Ready to reach cold?"* + bright-blue "Open app →" button.
6. **Footer:** thin row, wordmark + copyright.

**Important detail on the Google sign-in button:** keep Google's official branding. White background, slate-200 border, pill shape, 4-color "G" logo (use `FcGoogle` from `react-icons/fc`). Don't restyle it with bright blue.

**Perf notes for this phase (the landing page is where every perf default earns its keep):**
- **Mark the page fully static.** At the top of `app/page.tsx`: `export const dynamic = 'force-static'`. Vercel will then serve it from the CDN edge — sub-100ms TTFB anywhere in the world. No server thinks, no KV is hit, just a pre-rendered HTML file.
- **No client JS for content.** The hero, the 5-step row, the terminal block, the integration cards, and the CTA section can all be pure server components — no `'use client'`, no React hooks, no interactivity. The only thing that needs client JS on this page is the Google sign-in button (because of the OAuth click handler) and a sticky-nav hover state if you add one. Keep the page's client bundle under 20 KB.
- **SVGs over images for icons.** The 5-step icons and the integration logos are all simple shapes — inline SVGs (or `lucide-react` icons, which compile to inline SVGs) are smaller than even an optimized PNG and don't need a separate request.
- **If you use a hero image, `next/image` with `priority`.** The `priority` flag tells Next to preload it instead of lazy-loading. Without it, your LCP is gated on the image download starting after JS parses.
- **Preload the OAuth route.** Add `<link rel="prefetch" href="/api/auth/signin/google">` so when the user clicks Continue with Google, the redirect feels instant. This is a one-liner that nobody does and it makes the sign-in feel snappier than it has any right to.
- **No analytics scripts in the head.** Vercel Analytics injects itself via a tiny client snippet that's already optimized; don't add Google Analytics, Hotjar, or anything else for the MVP.

**Lighthouse target:** Performance 95+, LCP under 1.5s. Run `npx lighthouse https://your-vercel-url.vercel.app` from your terminal once this phase is done. If you're under 95, the bundle analyzer will tell you why.

**Done when:** the landing page renders all six sections, scores 95+ on Lighthouse Performance, and the "Open app" button routes correctly.

---

## Cross-cutting polish (sprinkle throughout, not its own phase)

- **Skeletons everywhere:** every fetch gets a `Skeleton`, not a spinner.
- **Error states:** any agent-surfaced error renders as a destructive `Alert` inline.
- **Toasts:** `Sonner` for confirmations, bottom-right, 3s auto-dismiss.
- **Focus rings:** every focusable element shows a clear bright-blue ring.
- **Optional `?` shortcut help dialog** listing keyboard shortcuts.

---

## The three things that make or break the demo

1. **Smooth streaming.** Tokens render fluidly, cursor blinks. The Edge runtime + Phase 5 perf notes are what make this work.
2. **The tone-switch animation.** ~250ms slide + slight fade. The arrow graphic should pulse subtly when keys are pressed.
3. **The celebration.** Confetti must fire the instant the send succeeds. The agent's message and the read-only sent card should appear together.

---

## Suggested daily rhythm (compressed timeline)

| Day | Phase | Outcome |
|---|---|---|
| 1 | Phase 0 + start Phase 1 | Deployed shell, OAuth working, perf tooling installed |
| 2 | Finish Phase 1 + Phase 2 | Email sending works; draft card animates beautifully |
| 3 | Phase 3 | Chat shell looks like ChatGPT, draft card sits inline |
| 4 | Phase 4 | KV persists everything, sidebar is real |
| 5 | Phase 5 (heavy day) | Agent works, Apollo returns one contact, three drafts generate |
| 6 | Phase 6 + Phase 7 | Celebration lands; onboarding gates new users |
| 7 | Phase 8 + polish + record demo | Landing page done with 95+ Lighthouse score, full flow rehearsed |

**Pre-demo checklist (15 min, day 7):**
- Run `ANALYZE=true npm run build` — confirm no route's bundle is unexpectedly large.
- Run Lighthouse against the landing page and `/chat` — both should be 90+.
- Test on a throttled network (Chrome devtools → Network → Slow 4G). The streaming should still feel acceptable.
- Pre-record a backup demo clip on a fast network in case of conference WiFi.

If you have to cut something, cut Phase 8 (landing) before any other phase — the app is fully demoable from `/chat` alone.
