# User Flow — Cold Email Agent

This document walks through every step a user takes from first landing on the site to sending their email. The product is now structured as a **persistent chat app** (think ChatGPT): the user can have many chats, each chat is its own focused session that guides them to **one** great email they actually send.

---

## Quick glossary (so the rest makes sense)

- **Next.js App Router**: The newer routing system in Next.js. Each folder in `app/` becomes a URL. So `app/chat/[chatId]/page.tsx` is the page at `/chat/<some-id>`.
- **Dynamic route**: A folder named in brackets like `[chatId]` matches anything in that URL slot. The value gets passed into the page as a param.
- **API routes**: Backend endpoints that live in the same Next.js project, under `app/api/`. They run on Vercel as serverless functions.
- **Vercel KV**: A simple key-value database (basically Redis) hosted by Vercel. We use it like a tiny database to remember user profiles, chats, and drafts.
- **NextAuth**: A library that handles "Sign in with Google," stores the session, and gives back an access token we use to send Gmail later.
- **Vercel AI Gateway**: A proxy in front of Claude. Instead of calling Anthropic directly, you call the Gateway. It handles streaming, retries, and lets you swap models without code changes.
- **Streaming**: Instead of waiting for the full AI response, tokens come in one at a time and render as they arrive (the "typing effect").
- **shadcn/ui**: Not a component library you install — it's a CLI that copies pre-styled React components into your repo. You own the code, so you can edit it.

---

## Step 0 — Landing page (`/`)

**What the user sees:**
A simple landing page with the product name, a one-line pitch ("Find the right person, draft the email, send it — in one chat"), and a single **"Sign in with Google"** button.

**What happens when they click the button:**
1. NextAuth redirects them to Google's OAuth consent screen.
2. We request the scopes we need: basic profile info **and** `gmail.send` (this is what lets us send email from their account later).
3. Google redirects back to our app with an authorization code.
4. NextAuth swaps that code for an access token + refresh token and stores them in a session cookie.
5. We redirect the user to `/onboarding` (first-timers) or `/chat` (returning users).

**State after this step:**
- A session cookie exists in the browser.
- NextAuth has the user's Gmail access token stored server-side (we'll need this when we send).

---

## Step 1 — First-time setup (`/onboarding`)

This screen **only shows up the first time**. On every subsequent visit, we skip straight into the chat app.

**How we know if it's their first time:**
After login, the server checks Vercel KV for `profile:{userId}`.
- If nothing exists → redirect to `/onboarding`.
- If a profile exists → redirect to `/chat` (which auto-opens their most recent chat or starts a new one).

**What the user sees on `/onboarding`:**
1. A file upload zone for their resume (PDF or .docx).
2. A large text area: "Anything else we should know? (target roles, companies you admire, what you're looking for, etc.)"
3. A **"Continue"** button at the bottom.

**What happens when they click Continue:**
1. The resume file gets uploaded via `POST /api/profile/resume`. The backend parses the text out of the PDF (using a library like `pdf-parse`) and stores it.
2. The text-area content gets sent via `POST /api/profile` along with the parsed resume text.
3. Both get saved in Vercel KV under `profile:{userId}` as one JSON blob: `{ resumeText, additionalContext, createdAt }`.
4. User is redirected to `/chat`, which immediately creates a new chat and routes them to `/chat/[chatId]`.

**Why we save both as text (not the PDF itself):**
The agent needs to *read* the resume on every chat turn. Re-parsing a PDF every time is slow and expensive. Storing plain text means we can stuff it into the system prompt instantly.

---

## Step 2 — The chat app (`/chat` and `/chat/[chatId]`)

This is the main surface of the product. It looks and behaves like ChatGPT: a sidebar of past chats on the left, the active chat on the right, and a "New chat" button at the top of the sidebar.

### Routing

- `/chat` — landing endpoint that redirects to the user's most recent chat, or creates a new one if they have none. The user shouldn't usually see this URL; it's a router.
- `/chat/[chatId]` — the actual chat view. Each chat has its own URL so the user can bookmark, share, or just navigate back via the browser's back button.

### What the user sees

**Left sidebar:**
- "+ New chat" button at the top.
- A list of past chats, most recent first. Each row shows a short auto-generated title (e.g., *"Frontend roles at fintech startups"*) and a status indicator: a small dot if the email was sent, a small icon if a draft is still in progress, nothing if the chat was abandoned.
- User avatar + sign-out menu at the bottom of the sidebar.

**Main area (right):**
- The active conversation thread.
- A message input at the bottom.
- A small "context" strip at the top of the chat showing what the agent has gathered so far (target role, company size, industry, location) — fields fill in as the conversation progresses.

### How a chat works (the goal of every chat)

Every chat is a guided journey toward **one useful email** the user actually sends. The agent's job is to keep narrowing things down — never to spit out a list. The chat should always feel like it's progressing toward a single, specific contact and a single, well-crafted email.

The agent opens with something like:
> "Hey! I read through your resume. Tell me about who you want to reach today — what kind of company, what kind of role, anything you've got."

The user types back. Messages stream in word-by-word (Vercel AI SDK's `useChat` hook handles this).

### What the agent is gathering

Across the chat, it pulls these out of natural conversation:
- **Target role** the user wants (e.g., "frontend engineer," "product designer")
- **Target company size** (decides whether we look for founders or hiring managers)
- **Industry** (e.g., fintech, dev tools, consumer)
- **Location** (optional)
- **Anything specific** the user wants the email to mention (a recent product launch, a shared connection, etc.)

The agent has been instructed via the system prompt to keep asking targeted follow-ups until it has enough to find a real person — and to avoid asking everything in one giant question.

### Finding the contact (the agent's tool call)

Once the agent has enough info, it calls a `find_contact` tool internally. The backend handler:

1. Translates the gathered filters into Apollo API parameters.
2. **Targeting rule from the spec:** if `companySize > 200`, target senior engineering managers (or equivalent). If `companySize < 50`, target founders. Middle range defaults to senior managers.
3. Calls Apollo's people-search endpoint asking for matching contacts with verified emails.
4. **Hard rule:** the agent reveals only **one contact** per chat. This respects the API limit and forces every chat to stay focused on a single, intentional outreach.
5. Returns the chosen contact (name, title, company, location, email) back into the chat as a special "contact card" message — not just plain text. The user sees who was found and can confirm before drafts get generated.

### Drafting three tone variants

After the user confirms the contact, the agent kicks off **three Claude calls in parallel** through the AI Gateway. Each one drafts the same email in a different tone:

- **Casual** — friendly, low-pressure, quick to read. Short sentences, conversational. Aim for ~80–120 words.
- **Professional** — warm intro, then 2–3 specific bullet points on why the user would be a good fit for the role they mentioned, then a clear ask. Goes into more detail. Aim for ~180–250 words.
- **Efficient** — blends the other two. Warm but compact. The intro is a sentence or two, the fit points are tight (maybe 2 bullets, maybe inline), and the ask is direct. Aim for ~120–160 words.

Every draft, regardless of tone, follows the same skeleton:
1. **Warm intro** — references the contact's company or recent work.
2. **Why I'd be a good fit** — pulls from the user's resume and the role they said they were interested in earlier in the chat.
3. **The ask** — a low-friction next step (15-min call, quick reply, etc.).

What changes between drafts is the voice and the level of detail, not the structure.

Each draft gets saved to Vercel KV under `draft:{chatId}:{variant}` with `status: "pending"`. The shape: `{ id, chatId, userId, contact, subject, body, tone: "casual" | "professional" | "efficient", status, createdAt }`.

### Showing the drafts in the chat

The drafts don't take you to a new page — they appear **inline in the chat** as a special message containing all three. The active draft is rendered as a card; the other two are stacked behind it visually. The user navigates between them with arrow keys or by clicking the on-screen arrow buttons.

The user can:
- **Press ← or → (or click the on-screen arrow buttons)** to flip between the casual / professional / efficient variants. There's a cute little arrow graphic at the bottom of the card indicating this — see the UI doc for what it looks like.
- **Click into the subject or body and edit inline.** Edits are auto-saved with a debounce. If they spend a long time refining (we'll detect this — see celebration below), the agent encourages them and recognizes the effort once they send.
- **Click "Send" (the bright blue primary CTA)** when they're happy with the version they've landed on.

### The celebration moment

When the user sends the email, the chat enters a final celebratory state:

1. Frontend POSTs to `/api/drafts/:id/send`.
2. Backend pulls the user's Gmail access token from their NextAuth session.
3. Backend calls Gmail API's `users.messages.send` with the chosen draft's subject + body + recipient email.
4. Backend updates the draft in KV: `status: "sent"`, sets `sentAt`. Updates the chat in KV: `status: "completed"`.
5. Frontend renders a celebration: confetti animation, a congratulatory agent message in the chat (e.g., *"Sent. That was a great one — you spent real time on it. Hit 'New chat' when you're ready for the next."*), and the chat is now read-only.

**The "real time" detection:**
We track timestamps and edit counts on the active draft. If the user has been editing for more than ~2 minutes, or has made more than ~5 edits, the celebration message acknowledges that specifically. It's a small touch but makes the moment feel earned. If they sent on the first try, the celebration is shorter and more like *"Sent. Clean and fast. New chat when you're ready."*

### Apollo failure case

If Apollo returns an error (out of credits, API key invalid), the agent surfaces a chat message like *"I'm out of Apollo credits and can't look up emails right now. Try again later or top up the account."* The chat enters an error state but isn't deleted — the user can retry.

---

## Step 3 — Returning users

A user comes back the next day and visits `/`.

1. NextAuth detects the session cookie is still valid → skips Google sign-in.
2. The server checks for `profile:{userId}` → exists → redirects to `/chat`.
3. `/chat` looks up the user's most recent chat. If it's `status: "completed"`, redirect to a new chat. Otherwise, resume that chat at `/chat/[chatId]`.
4. The sidebar shows their full chat history. They can click any old chat to read it (read-only if completed).
5. Every new chat still includes their resume and onboarding context in the system prompt — so the agent always "knows" them.

---

## Backend route summary

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | (handled by NextAuth) | Google sign-in & callback |
| `/api/profile` | GET | Check if profile exists; return resume + context |
| `/api/profile` | POST | Save additional context text |
| `/api/profile/resume` | POST | Upload resume, parse, store text |
| `/api/chats` | GET | List all chats for the user (for the sidebar) |
| `/api/chats` | POST | Create a new chat, return its ID |
| `/api/chats/:chatId` | GET | Get a single chat's full message history |
| `/api/chats/:chatId/messages` | POST | Send a user message; streams the agent's response back. This route also orchestrates Apollo + draft generation when the agent calls its tools |
| `/api/drafts/:id` | PATCH | Update a draft (edit content) |
| `/api/drafts/:id/send` | POST | Send the chosen draft via Gmail |

---

## Vercel KV data shapes

```
profile:{userId} → {
  userId,
  resumeText: string,
  additionalContext: string,
  createdAt: number
}

chat:{chatId} → {
  id,
  userId,
  title: string,           // auto-generated from first user message
  status: "active" | "completed" | "abandoned",
  messages: [...],         // full conversation history
  contact?: { ... },       // populated once Apollo returns
  createdAt, updatedAt
}

chats:{userId} → Set of chatIds   // for the sidebar list

draft:{chatId}:{variant} → {
  id,
  chatId,
  userId,
  contact: { name, title, company, email, location },
  subject: string,
  body: string,
  tone: "casual" | "professional" | "efficient",
  status: "pending" | "sent",
  editCount: number,           // for the celebration heuristic
  firstEditAt?: number,
  lastEditAt?: number,
  createdAt: number,
  sentAt?: number
}
```

---

## A note on the demo path (build backwards from here)

The spec says to build backwards from the demo. Updated demo path:

> Sign in → onboard → start a chat → guide the agent to a specific contact → see three tone variants drafted → arrow through them, edit inline → send → celebration → real email arrives.

Build order:
1. Hello-world deploy on Vercel (hour 1 — proves the pipeline works).
2. Hardcode a fake draft and get the **send-via-Gmail** flow working end-to-end. This is the riskiest integration; nail it first.
3. Build the three-tone draft UI with arrow navigation, hardcoded content. Get the animation feeling good.
4. Build the chat layout (sidebar + active chat) with hardcoded messages.
5. Wire up the streaming agent + Apollo tool call so drafts get generated for real.
6. Add the celebration moment.
7. Onboarding, then landing page, last.

Each piece, once working, plugs into the layer above it.