# UI Design — Screen-by-Screen

This document describes what each screen should look like and feel like, plus which **shadcn/ui components** to reach for. The product is a chat app (think ChatGPT) that guides the user through a focused conversation toward one well-crafted email. The visual reference points: Linear, ChatGPT, and the Vercel dashboard.

---

## Design system foundation (set this up first)

Before building any screen, lock in these defaults. shadcn copies the components into your repo, but you control the global styles in `app/globals.css` and `tailwind.config.ts`.

### Color palette

- **Base:** Slate. Use Tailwind's `slate-50` through `slate-950` scale for backgrounds, borders, and text. This is your neutral.
  - Light mode background: `slate-50`. Cards: white. Borders: `slate-200`. Text: `slate-900` for primary, `slate-500` for muted.
  - Dark mode background: `slate-950`. Cards: `slate-900`. Borders: `slate-800`. Text: `slate-50` for primary, `slate-400` for muted.
- **Accent for CTAs:** Bright blue. Use `blue-600` for primary buttons and `blue-500` on hover. This is the only color outside the slate scale you should use, and only for action elements:
  - Primary buttons (Send, Continue, Open app)
  - Active state in the sidebar
  - Focus rings on inputs
  - The "Send" CTA on the draft card
  - Subtle highlights, like the active nav item in the sidebar

The discipline is: **slate everywhere except the things you want the user to click.** That contrast is what makes the blue feel intentional.

In Tailwind config, you can alias this via shadcn's CSS variables — set `--primary` to a blue and `--primary-foreground` to white. shadcn's `Button` with `variant="default"` will then automatically pick up the bright blue.

### Typography
Default Geist Sans (Vercel's font, comes free with Next.js). Use Geist Mono for any code-like text (email addresses, IDs, the API surface block on the landing page).

### Spacing
Be generous. Lots of whitespace. The whole product is conversational — don't crowd it.

### Dark mode
shadcn supports this out of the box via `next-themes`. Worth flipping on early because the chat layout and the landing page both look great in dark mode for the demo TikTok.

### Layout pattern
- **Pre-login screens** (landing, onboarding): centered max-width container (`max-w-6xl mx-auto` for the landing page so the multi-column sections breathe; `max-w-2xl` for onboarding).
- **Chat app**: full viewport, two-column. Left sidebar fixed width (~260px), right side flexes to fill.

---

## Screen 1 — Landing page (`/`)

The landing page has more density than the rest of the product. It's the only marketing surface, so it does the work of explaining what this thing is, who built it on, and convincing the user to sign in. It's a single scrolling page with several sections.

**A note on visual style for the landing page:**
The reference screenshots provided use a dark cream/serif aesthetic (think Vercel marketing pages). If you want that exact look, you'd switch the landing page to use a serif display font (like Instrument Serif or Fraunces) for headlines and a warm cream/black background — and keep slate + bright blue only inside the app. That's a totally valid choice and matches the marketing-page-vs-product-page convention many products use. **For consistency with the rest of this doc I'm describing the landing page in slate + blue, but the structure below works either way — just swap the palette if you go the serif/cream direction.**

### Section A — Hero

Top of page, centered.
- Small product wordmark in the top-left of the page (sticky nav optional — for MVP you can skip it).
- Large headline (~56px on desktop): something like *"Cold emails that actually go out."*
- Subheadline (~18px, slate-500): *"Find the right person. Draft the email in three tones. Send it. All in one chat."*
- A primary **"Continue with Google"** button — see the dedicated section on this below.

Underneath the CTA, optionally a tiny line of supporting text: *"Free to try. No credit card."*

### Section B — How it works (5 horizontal steps)

This is one of the sections from the reference screenshots — keep this structure.

A section heading layout:
- A small uppercase eyebrow label centered above the heading: `HOW IT WORKS` in slate-500, tracking-wider.
- A large heading below it: *"From resume to inbox in minutes"*.

Below the heading, a **horizontal 5-step row** spaced evenly across the section. Each step is a column with:
- A square icon tile at the top (~64px, rounded, slate-200 background in light mode / slate-800 in dark mode, with a slate-700 / slate-300 icon inside). Icons from `lucide-react`.
- A small uppercase step label below the tile: `STEP 1`, `STEP 2`, etc. in slate-500.
- The step title in bold slate-900 (or slate-50 in dark mode).
- A 1–2 line description in slate-500.

Between each pair of steps, a thin chevron `>` separator centered vertically (slate-400, low opacity), so the eye reads the row as a flow.

The five steps, mapped to our actual flow:

| # | Icon | Title | Description |
|---|------|-------|-------------|
| 1 | upload-cloud | **Upload resume** | Drop your resume or paste context about yourself. |
| 2 | message-square | **Chat with the agent** | Tell it who you want to reach — the agent narrows it down. |
| 3 | target | **Pick your target** | Confirm the contact Apollo finds. One person, one chat. |
| 4 | sparkles | **Three tones drafted** | Claude writes casual, professional, and efficient versions. |
| 5 | mail | **Edit and send** | Arrow through, refine, hit send — straight from your Gmail. |

This maps step-for-step to the journey described in `user-flow.md`.

### Section C — Live API surface (terminal block)

Optional but recommended — this is one of the reference screenshots. It's a "for the engineers" credibility moment that also doubles as documentation of what's running under the hood.

A centered card styled to look like a terminal window:
- Three small dots (red `red-500`, yellow `yellow-500`, green `green-500`) in the top-left, mimicking a macOS window.
- Next to the dots, a tiny mono label: `API surface` in slate-500.
- Below that, a list of endpoints in Geist Mono with HTTP-method coloring:
  - `POST` in green (`emerald-500`)
  - `GET` in blue (`blue-500`)
  - `PATCH` in yellow (`amber-500`)
  - `DELETE` in red (`red-500`)
- Each row: method, then the route in slate-200 (light) / slate-300 (dark), then a `—` and a description in muted slate-500.

The endpoints to display (these match the routes in `user-flow.md`, **not** the screenshot — the screenshot shows older route names from an earlier draft of the spec):

```
POST    /api/chats/:chatId/messages   — Stream agent reply, run Apollo, draft tones
GET     /api/chats                    — List your chats for the sidebar
PATCH   /api/drafts/:id               — Edit subject or body inline
POST    /api/drafts/:id/send          — Send via your Gmail
```

If you want to match the screenshot more literally and keep the section punchier with five rows, you can also include the `DELETE /api/chats/:chatId` for chat deletion — though that's a small backend addition not currently in the route summary.

Background of this block: `slate-900` always (looks like a terminal regardless of light/dark page mode). Subtle border, generous internal padding.

### Section D — Powered by tools you trust (4 integration cards)

Another section from the reference screenshots. Same eyebrow + heading layout as Section B.
- Eyebrow: `INTEGRATIONS` (uppercase, slate-500, tracked).
- Heading: *"Powered by tools you trust"*.

Below it, a **4-column grid** of integration cards. Each card:
- Square icon tile in the top-left (~48px, rounded), with a brand-tinted background and a brand icon inside. Each integration gets its own subtle accent color, but kept low-saturation so it doesn't fight the slate palette:
  - **Apollo.io** — blue tile with a magnifying-glass icon (`Search` from lucide).
  - **Claude Opus 4.5** — purple tile with a sparkles icon (`Sparkles`).
  - **Gmail API** — red tile with a mail icon (`Mail`).
  - **Vercel KV** — green/black tile with a lightning bolt (`Zap`).
- Tool name in bold slate-900 (slate-50 in dark mode).
- A small uppercase tagline in slate-500 (e.g., "Contact discovery", "Email generation", "Direct sending", "Draft persistence").
- A 2–3 line description in slate-500 below.

Card backgrounds: white in light mode, `slate-900` in dark mode, with a `slate-200` / `slate-800` border, `rounded-xl`.

The four card contents:

| Tool | Tagline | Description |
|------|---------|-------------|
| **Apollo.io** | Contact discovery | Searches millions of verified B2B contacts by role, company, and industry. |
| **Claude Opus 4.5** | Email generation | Anthropic's most capable model drafts emails using your context and three outreach tones. |
| **Gmail API** | Direct sending | Sends via your own Google account. Emails land in primary inboxes — not spam. |
| **Vercel KV** | Draft persistence | All drafts are stored in Upstash Redis on Vercel — fast, globally distributed, zero config. |

### Section E — Final CTA ("Ready to reach cold?")

This is the bottom-of-page section from the reference screenshots. Centered, generous vertical padding (~120px top and bottom), no card or border — just text on the page background.

- Heading (~56px, same display style as the hero): *"Ready to reach cold?"*
- Subheadline (~16px, slate-500, max-width ~500px so it wraps onto two lines): *"Sign in with Google to enable Gmail sending, or jump straight in to see how the agent works."*
- A single pill-shaped primary button: **"Open app →"** with a right-arrow icon. This goes to `/chat` — which itself routes to onboarding if needed, or sign-in if they're not authenticated yet. So this one button works whether they've signed in already or not.

### Section F — Footer

Minimal. A single thin row at the bottom:
- Left: small wordmark + a copyright line (e.g., "© 2025").
- Right: 2–3 link spots if you want — "GitHub", "Twitter/X", "Privacy" — but for MVP you can skip these entirely.

---

### The "Continue with Google" button (used in hero + onboarding)

The Google sign-in button needs to follow Google's official branding so users immediately recognize and trust it. **Don't restyle it with your bright blue.** This is the one place where your slate-and-blue rule has an exception, because trust signals matter more than palette consistency.

Specifically:
- White background (`bg-white`), slate-200 border (`border border-slate-200`), `rounded-full` (pill shape).
- The official Google "G" logo on the left — the one with the four colors (blue, green, yellow, red). You can grab the SVG from Google's branding guidelines, or use an icon library like `react-icons` (`FcGoogle` from `react-icons/fc` is the standard).
- Label: **"Continue with Google"** in slate-900, medium weight.
- Generous horizontal padding (`px-6 py-3` minimum), so the button feels substantial.
- Subtle shadow on hover (`hover:shadow-md`), no color change.

This same button shows up:
- On the hero of the landing page (the primary CTA above the fold).
- Anywhere else sign-in is triggered (in case you add a sticky "Sign in" in the top-right nav later).

The "Open app" button at the bottom of the landing page (Section E) is **different** — that one uses the bright-blue primary style because it's not a sign-in button, it's an app-launch button.

**shadcn components for the landing page overall:** `Button`. That's actually it — most of the landing page is layout, typography, and icons rather than complex components. `lucide-react` for icons, `react-icons/fc` for the Google G specifically.

---

## Screen 2 — Onboarding (`/onboarding`)

**Vibe:** Friendly, single-purpose form. Like Notion's onboarding — one screen, a couple of fields, you're done.

**Layout:**
A centered card (use shadcn's `Card` component, white in light mode / `slate-900` in dark mode) with two sections inside:

**Section 1 — Resume upload:**
- Label: "Upload your resume"
- A dashed-border drop zone (`border-slate-300` dashed). When empty: shows a cloud-upload icon and text *"Drop your resume here, or click to browse"*. Accepts `.pdf` and `.docx`.
- When a file is selected: replace the drop zone with a row showing the filename, file size, and an X button to remove it.
- Use shadcn's `Input` with `type="file"` underneath, but style the visible UI as a custom drop zone. (v0 will give you this pattern if you ask.)

**Section 2 — Additional context:**
- Label: "Tell us anything else"
- Help text below the label: *"Roles you're targeting, companies you admire, what makes you a good fit. The more specific, the better the matches."*
- A large `Textarea` (shadcn) — minimum 6 rows.

**Bottom of card:**
- A `Button` labeled "Continue" — disabled until both the resume is uploaded and the textarea has at least ~50 characters. Show a small character counter under the textarea. The button uses the bright blue primary variant.

**Loading state during upload:**
Once the user clicks Continue: button shows a spinner (use `Loader2` from `lucide-react` with `animate-spin`), text changes to "Setting up your profile…". Disable the button.

**shadcn components:** `Card`, `Input`, `Textarea`, `Button`, `Label`.

---

## Screen 3 — Chat app (`/chat/[chatId]`)

This is the main surface. Two columns: a sidebar with chat history on the left, the active conversation on the right.

### Left sidebar (~260px wide, full height)

Background: `slate-100` in light mode, `slate-950` in dark mode (slightly darker than the chat area to create depth).

**Top — "+ New chat" button:**
- Full-width button at the top of the sidebar.
- Uses the bright blue primary variant. White text, blue background.
- A `+` icon on the left, "New chat" label.
- This is one of the only blue elements in the whole sidebar — it pops, exactly as intended.

**Middle — chat list:**
- Each chat is a row:
  - Auto-generated title (truncated to one line, e.g., *"Frontend roles at fintech startups"*).
  - Below it, a tiny status indicator: a small filled circle if `status: completed`, an outline circle if `status: active`, nothing for `abandoned`.
- The currently active chat row has a subtle background tint (`slate-200` light / `slate-800` dark) and a thin bright-blue left border (~2px) to mark it as selected.
- Hover state: full background tint without the blue border.
- Click → navigates to `/chat/[that-chat-id]`.

**Bottom — user menu:**
- A row with the user's avatar (or initial circle), their name, and a chevron.
- Click opens a `DropdownMenu` with "Sign out" and maybe "Toggle theme."

**shadcn components for sidebar:** `Button`, `ScrollArea` (for the chat list), `Avatar`, `DropdownMenu`.

### Right side — active conversation

Background: white in light mode / `slate-900` in dark mode.

**Top — context strip:**
A thin horizontal bar (~50px tall) at the very top showing what the agent has gathered so far. Six small `Badge` components in a row, one per field:
- Role
- Company size
- Industry
- Location

Each badge is muted slate when the field is empty, and slate-900-on-white with a small bright-blue dot when filled.

This is what makes the natural-language filter-gathering visible. As the agent extracts info, badges light up.

**Middle — chat messages thread:**
- User messages: right-aligned, in a `slate-100` (light) / `slate-800` (dark) bubble, max-width ~65% of the column.
- Agent messages: left-aligned, no bubble, just the text — with a small Claude-style avatar to the left.
- Streaming messages show a blinking cursor at the end of the latest text until the response completes.
- Auto-scroll to bottom on every new message.

**Special agent message types** (rendered inline in the thread, not as plain text):

1. **Status panel** — when the agent is calling Apollo and drafting:
   - A card-like message with progressive checkmarks:
     - ⏳ → ✓ Searching Apollo
     - ⏳ → ✓ Found your contact
     - ⏳ → ✓ Drafting three tone variants (1/3, 2/3, 3/3)
   - Once done, the panel collapses into a single line and the contact card + drafts appear below.

2. **Contact card** — once Apollo returns:
   - A small `Card` showing the contact's name, title at company, location, and a verified-email icon.
   - A short agent message above asks the user to confirm: *"Found Jane Lee — Senior Engineering Manager at Stripe in NYC. Want me to draft? (Yes / find someone else)"*
   - Two small `Button`s below the card: a primary blue "Draft these" and a ghost "Find someone else."

3. **The drafts message** — the heart of the UX, see below.

**Bottom — message input:**
- A `Textarea` that grows up to ~5 rows, with a circular blue arrow-up "Send" `Button` on the right.
- Pressing Enter sends; Shift+Enter inserts a newline.
- When the agent is mid-stream, the send button is disabled and shows a stop icon instead.

**shadcn components for chat area:** `ScrollArea`, `Badge`, `Card`, `Button`, `Textarea`, `Avatar`.

---

## Screen 4 — The drafts (inline in the chat)

This is the demo money shot. It's not a separate page — it appears as a special message inside the chat thread, but visually it should command the eye.

### The card

A medium-large `Card` (~600px wide), centered in the chat thread. Subtle shadow to lift it off the background. Slightly rounded corners (`rounded-xl`).

### Tone tabs (top of the card)

Three small pill-shaped tabs across the top of the card, side by side:
- **Casual**
- **Professional**
- **Efficient**

The active tab has a `slate-900` background (or white in dark mode) with a small bright-blue dot or underline. Inactive tabs are muted (`slate-500` text, transparent background).

These are clickable in addition to the arrow keys — gives the user another affordance to discover the variants.

### Card body (top to bottom)

1. **Contact header** (~80px tall):
   - Avatar (colored initial circle).
   - Name in bold, slate-900.
   - Below name: title at company in slate-500, e.g., *"Senior Engineering Manager at Stripe"*.
   - Right side: the recipient email in mono font (Geist Mono), small, slate-500, with a small lock icon to convey "verified."

2. **Subject line:**
   - Tiny uppercase slate-500 label "Subject."
   - The subject in a single-line editable `Input`. Click to edit, blur to save. Bright blue focus ring when active.

3. **Body:**
   - Tiny uppercase slate-500 label "Email."
   - A `Textarea` showing the email body, ~10 rows tall, editable. Same bright blue focus ring.
   - Auto-save on debounce. A tiny "Saved" text fades in next to the field for ~1 second after each save.

4. **Tone pill in the body corner** (small touch):
   - In the bottom-right of the body area, a tiny `Badge` reminding which tone you're on, e.g., "Casual · ~95 words". Helps the user feel the difference between drafts.

### The arrow navigation graphic (bottom of the card)

This is the "cute graphic" the spec mentions. It sits centered below the body, above the action buttons.

A small horizontal control with three elements:

```
    [ ← ]   ●  ○  ○   [ → ]
```

- **Left arrow button** — a small slate-200 background circle with a left-arrow icon. Click cycles to previous tone. Subtle hover state. Has a tiny keyboard hint floating above it on hover: *"←"*.
- **Three dots in the middle** — represent the three tone variants. The active one is a filled bright-blue dot (`blue-600`); the others are outlined slate-300 dots. Acts like a progress indicator showing which of the three you're on.
- **Right arrow button** — mirror of the left.

Below this control, in tiny slate-500 text: *"Use ← → to switch tones"*.

This is the discoverable, friendly version of "press an arrow key" — the user immediately understands they have three options and how to flip between them.

### Action buttons (very bottom of the card)

A horizontal row, right-aligned:
- A ghost "Discard chat" button on the far left (small, muted) — abandons the chat.
- The primary **"Send email"** `Button`. Bright blue, white text, paper-airplane icon. This is the dominant CTA on the screen.

### Animations when switching tones

When the user presses ← or →:
- The current card content slides off horizontally (left or right depending on direction), about 250ms with slight fade.
- The new tone's content slides in from the opposite side.
- Use `AnimatePresence` from Framer Motion. Subtle, not theatrical — the user is comparing options, not performing tricks.

Three things stay consistent across the slide: the tone tabs at the top, the arrow nav graphic at the bottom, and the action buttons. Only the contact header (small movement, since it's the same person) and the subject + body change.

---

## Screen 5 — Celebration (still inside the chat)

When the user clicks "Send email," the email goes out and the chat enters its final state.

**What replaces the draft card:**
- A confetti animation fires once (use `canvas-confetti` or `react-confetti`). Bright blue and slate confetti, no other colors, to stay on-palette.
- The draft card collapses into a smaller "sent" card showing: ✓ icon (bright blue), recipient name, subject line, sent timestamp. Read-only.
- A new agent message appears below it. The exact text depends on the user's edit behavior:
  - **If they spent >2 min editing or made >5 edits:** *"Sent. That was a great one — you spent real time on it. The best emails feel exactly like that."*
  - **If they sent on the first try:** *"Sent. Clean and fast. Nice."*
  - In either case, it ends with: *"Hit '+ New chat' in the sidebar when you're ready for the next one."*

**Sidebar update:**
The current chat row in the sidebar updates its status indicator to the filled-circle "completed" state. The active blue left-border stays.

**Input is disabled:**
The message input at the bottom of the chat is greyed out — completed chats are read-only. Hover state on the input shows a small tooltip: *"This chat is done. Start a new one."*

**shadcn components for celebration state:** `Card`, `Badge`, `Tooltip`. Plus the `canvas-confetti` package (not from shadcn).

---

## Cross-cutting UI details

### Loading and empty states
Every fetch should have a skeleton state, not just a spinner. shadcn has a `Skeleton` component — use it for the chat list while it loads, and the chat history when you switch chats.

**Empty sidebar state** (brand new user, no chats yet):
After onboarding, the sidebar will be empty. Show a small illustration or icon and text *"No chats yet. Start one above."* below the "+ New chat" button.

### Error states
Use shadcn's `Alert` component (variant `destructive`) for errors like "Apollo is out of credits." Place it inline in the chat thread when the agent surfaces it.

### Toast notifications
For send confirmations ("Email sent to jane@stripe.com"), use shadcn's `Sonner` toast. Bottom-right corner, auto-dismiss after 3s.

### Keyboard shortcut hint
In the draft card, the arrow graphic at the bottom is the discoverability mechanism. Optionally add a `?` key that opens a small `Dialog` showing all keyboard shortcuts (← →, Enter to send, Esc to discard).

### Focus states
Every focusable element should have a clear bright-blue (`blue-500`) focus ring. shadcn handles this via the `ring` utility — make sure your CSS variable for `--ring` is set to your blue.

---

## Component checklist (everything you'll install via shadcn CLI)

```
button, card, input, textarea, label, badge, avatar,
scroll-area, separator, alert, dialog, dropdown-menu,
tooltip, skeleton, sonner
```

Plus from npm:
```
lucide-react       (icons)
react-icons        (specifically FcGoogle for the Google sign-in button)
framer-motion      (card animations between tones)
canvas-confetti    (celebration)
@ai-sdk/react      (the useChat hook)
```

---

## Three things worth getting right for the demo TikTok

1. **The streaming feel in the chat.** Make sure tokens render smoothly and the cursor blinks. If the network is slow, the streaming will look choppy — that's why the spec says to pre-record a backup clip on a good network.

2. **The tone-switch animation in the draft card.** This is the defining visual. Tune it to ~250ms with a slight fade. Too slow = boring. Too fast = invisible. The arrow graphic at the bottom should pulse subtly when keys are pressed, so it's clear *which* control was used.

3. **The celebration moment.** Confetti, the sent card, the agent's acknowledgment — this is the emotional payoff. Make sure it triggers reliably and the timing feels good (confetti starts the instant the send succeeds, not when the API call is fired).