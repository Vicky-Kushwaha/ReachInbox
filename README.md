# ReachInbox — Email Job Scheduler

A production-grade email scheduler service + dashboard: schedule emails to send at a
specific time, at scale, with persistent BullMQ-backed queueing (no cron), per-sender
rate limiting, live Slack alerts, and a searchable send history.

```
reachinbox-scheduler/
├── backend/        Express + TypeScript API + BullMQ worker
├── frontend/       Next.js + TypeScript + Tailwind dashboard
└── docker-compose.yml   Postgres + Redis + Elasticsearch
```

---

## 1. Quick start

### Option A — one command (recommended)

```bash
cp .env.example .env       # fill in Google/Slack OAuth creds, see §3
docker compose up -d --build
```

That's it. This single command builds and starts **everything**: Postgres, Redis,
Elasticsearch, the backend API (which runs migrations automatically on boot), the
BullMQ worker, and the Next.js frontend — all networked together, using the same
`.env` file at the project root.

| Service       | URL                              |
|---------------|-----------------------------------|
| Frontend      | http://localhost:3000            |
| Backend API   | http://localhost:4000            |
| BullMQ dashboard | http://localhost:4000/admin/queues |
| Elasticsearch | http://localhost:9200            |

Useful follow-up commands:

```bash
docker compose logs -f worker     # watch the auto-generated Ethereal credentials on first boot
docker compose logs -f backend    # API logs
docker compose down               # stop everything
docker compose down -v            # stop and wipe Postgres/Redis/ES volumes too
docker compose up -d --build      # rebuild after a code change
```

The backend and worker run from the **same image** (`backend/Dockerfile`) — which
role a container plays is controlled by the `SERVICE_ROLE` env var (`worker` vs
unset/api), set for you in `docker-compose.yml`. The backend container also runs
`node dist/db/migrate.js` before starting the API, so schema setup is automatic and
idempotent (safe on every restart).

### Option B — run services individually (for active development)

Useful when you want hot-reload on the backend/frontend instead of rebuilding images
on every change.

#### 1. Start infrastructure only

```bash
docker compose up -d postgres redis elasticsearch
```

No Docker? Install Postgres 14+, Redis 6+, and Elasticsearch 8+ locally and point the
`.env` files at them instead.

#### 2. Backend

```bash
cd backend
cp .env.example .env       # fill in Google/Slack OAuth creds, see §3
npm install
npm run migrate            # creates tables (idempotent, safe to re-run)
npm run dev                # starts the Express API on :4000
```

In a **second terminal**, start the worker (separate process, so it can be scaled
independently of the API):

```bash
cd backend
npm run worker:dev
```

If you don't set `ETHEREAL_USER`/`ETHEREAL_PASS`, the worker auto-creates a fresh
Ethereal test inbox on first boot and prints the credentials + login URL to the
console — copy those into `.env` so you keep the same inbox across restarts.

#### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

### 1.4 First login (either option)

Visit `http://localhost:3000`, sign in with Google, and you'll land on the dashboard.
A default "sender" (your Google name/email) is created automatically on first login.

---

## 2. Architecture overview

### 2.1 How scheduling works (no cron)

Every recipient becomes one row in the `emails` table and **one BullMQ delayed job**,
added with:

```ts
queue.add("send-email", jobData, { jobId: `email-${row.id}`, delay });
```

- **`delay`** is `scheduledTime - now`, computed once at creation time. BullMQ stores
  the job in a Redis sorted set keyed by its "process at" timestamp and moves it to
  the active queue itself when that time arrives — there is no polling loop, no
  `setInterval`, and no OS/node cron anywhere in the codebase.
- **`jobId: email-<id>`** is deterministic. BullMQ treats `add()` with an existing
  jobId as a no-op (returns the existing job rather than creating a duplicate), which
  is what gives us **idempotency**: the same email can never be double-queued, no
  matter how many times a given code path runs.

When a campaign is created, recipients are also spaced out **sequentially** at
creation time (`scheduledTime = startTime + i * minDelayMs`), so ordering and minimum
spacing are baked in up front — before the worker's own runtime enforcement kicks in
as a second layer (see §2.3).

### 2.2 Persistence across restarts

Two layers protect against restarts:

1. **BullMQ's own persistence.** Delayed jobs live in Redis, not in process memory.
   Restarting the Express API or the worker process does nothing to jobs already
   queued — they fire at their original time either way.
2. **Postgres-backed reconciliation** (`src/queues/scheduler.ts`), run once on API
   boot. This covers the harder case: if Redis's data were ever lost independently of
   Postgres (e.g. a fresh Redis volume), we rebuild the queue from the source of
   truth. For every `emails` row still in `scheduled`/`rescheduled` status, we check
   whether a live BullMQ job exists (`queue.getJob(jobId)`); if not, we re-add it.
   Because jobIds are deterministic, this is always safe to run — including on every
   normal boot — and never produces a duplicate send.

Net effect: **stop the server, start it again — future emails still send on time, and
nothing is resent or restarted from scratch.**

### 2.3 Rate limiting & concurrency

**Worker concurrency** — `WORKER_CONCURRENCY` (env, default 5) is passed straight into
BullMQ's `Worker({ concurrency })`. Each worker process pulls up to that many jobs off
the queue in parallel.

**Minimum delay between sends, per sender** — rather than `sleep()`-ing inside a
worker slot (which would waste concurrency), we track `lastSentAt` per sender in
Redis. If a job for sender X arrives before `lastSentAt + minDelayMs`, we call
`job.moveToDelayed(readyAt)` and throw BullMQ's `DelayedError` — the job goes back
into the delayed set and the worker slot is immediately free for a job from a
*different* sender. A global worker-level `limiter` option is also set as a
belt-and-suspenders floor.

**Emails per hour, per sender** — enforced with an atomic Redis counter keyed by
`ratelimit:sender:<id>:<hour-bucket>` (e.g. `...:2026-08-29T14`). `INCR` is atomic in
Redis, so this is safe across any number of worker processes/instances — two workers
can never both "win" the same slot. Trade-offs, spelled out in
`src/services/rateLimiter.ts`:

- This is a **fixed hour-of-day window**, not a rolling 60-minute window. It's simpler
  and matches "N per hour" semantics literally, but a burst could in theory land up to
  ~2x the limit across a window boundary (e.g. right before and right after `:00`). A
  stricter rolling window would use a Redis sorted set of timestamps
  (`ZADD` / `ZREMRANGEBYSCORE`) instead of a simple counter — noted as a next step.
- All limits (`MAX_EMAILS_PER_HOUR`, `minDelayMs`) are **configurable per campaign**
  via the compose form (and have env-level defaults), not hardcoded.

**When the hourly limit is hit:** the job is **never dropped or failed**. Its DB row
is marked `rescheduled`, its `scheduled_time` is bumped to the start of the next hour
window, and the BullMQ job itself is moved to fire at that same timestamp
(`job.moveToDelayed`) — order is preserved as much as possible since jobs simply slide
forward together.

**Slack notification on rate-limit hit:** the moment `tryReserveSendSlot` returns
false, the worker calls `notifyRateLimitHit(userId, senderName, cap)` — a live network
call to `chat.postMessage` (or the incoming webhook URL, if that scope was granted),
not a log line. It looks up the Slack integration fresh from Postgres on every call,
so: no integration connected → silent no-op, no crash; connect Slack later → the very
next rate-limit hit notifies, with zero redeploy.

**Behavior under load (1000+ emails scheduled at once):** all 1000 rows/jobs are
created in a single DB transaction, then enqueued as BullMQ delayed jobs. Nothing
about job creation is O(n²) or blocking — the worker simply drains the queue at
whatever combined throughput `concurrency` × `minDelayMs` × the hourly cap allows,
naturally spilling excess volume into subsequent hour windows via the reschedule path
above.

### 2.4 Search (Elasticsearch)

Every email is indexed (best-effort — a search-index failure never blocks sending or
fails the job) into an `emails` index on Elasticsearch, keyed by the same numeric id
as Postgres. `GET /api/emails/search?q=...` does a `multi_match` across recipient,
subject, and body with fuzziness for typo tolerance.

### 2.5 Live BullMQ dashboard

Mounted via `@bull-board/express` at **`/admin/queues`** on the backend
(`http://localhost:4000/admin/queues`) — shows active/delayed/completed/failed jobs in
real time, no separate service to run.

### 2.6 Auth

- **Google login** is a real server-side OAuth 2.0 authorization-code flow
  (`google-auth-library`), not a client-side mock: `/auth/google` redirects to Google's
  consent screen, `/auth/google/callback` exchanges the code, verifies the ID token,
  upserts a `users` row, and sets an httpOnly JWT session cookie.
- **Slack connect** follows the same real OAuth pattern (`/auth/slack/connect` →
  Slack consent → `/auth/slack/callback` exchanges the code via
  `oauth.v2.access` and stores the bot token / incoming webhook per user).

---

## 3. Environment variables

- **One-command Docker path**: copy `.env.example` → `.env` at the **project root**;
  `docker-compose.yml` reads it automatically and passes the right values through to
  each service (internal hostnames like `postgres`/`redis`/`elasticsearch` are already
  wired up for you — you only need to fill in the OAuth credentials below).
- **Individual-services path**: use `backend/.env.example` → `backend/.env` and
  `frontend/.env.local.example` → `frontend/.env.local` instead (these point at
  `localhost` since nothing is on a Docker network in that mode).

Either way you will need to create your own:

- **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials →
  OAuth Client ID → "Web application"). Add
  `http://localhost:4000/auth/google/callback` as an authorized redirect URI.
- **Slack app** ([api.slack.com/apps](https://api.slack.com/apps) → "Create New App").
  Add the `chat:write` (and optionally `incoming-webhook`) scopes and set the redirect
  URL to `http://localhost:4000/auth/slack/callback`.
- **Ethereal Email** — no signup needed; leave `ETHEREAL_USER`/`ETHEREAL_PASS` blank
  and the app creates a throwaway inbox for you on first run (credentials logged to
  the worker's console). Or create a persistent one manually at
  [ethereal.email](https://ethereal.email).

---

## 4. Features implemented

**Backend**
- [x] Email scheduling API, BullMQ delayed jobs (no cron)
- [x] Postgres persistence of campaigns/emails/senders/users/Slack integrations
- [x] Restart-safe: BullMQ Redis persistence + Postgres reconciliation sweep on boot
- [x] Idempotent sends via deterministic jobId (`email-<row id>`)
- [x] Configurable worker concurrency
- [x] Configurable minimum delay between sends, enforced per-sender via Redis + `DelayedError`
- [x] Configurable emails-per-hour cap, enforced atomically via Redis counters, safe across multiple workers
- [x] Rate-limited jobs are rescheduled into the next hour window, never dropped/failed
- [x] Live Slack notification (real API call) the moment a rate limit is hit, with graceful connect/disconnect handling
- [x] Elasticsearch indexing + `/api/emails/search`
- [x] Live BullMQ dashboard via Bull-Board at `/admin/queues`
- [x] Real Google OAuth (authorization-code flow) and real Slack OAuth
- [x] HTML body + up to 3 attachments per campaign (stored as base64 in Postgres,
      sent via Nodemailer's `attachments` option)
- [x] Per-email starring (`PATCH /api/emails/:id/star`) and cancellation of
      not-yet-sent emails (`DELETE /api/emails/:id`, removes the live BullMQ job)
- [x] `GET /api/emails/:id` full detail endpoint and `GET /api/senders` for the
      compose "From" picker

**Frontend**
- [x] UI rebuilt to match the provided Figma reference (login card, sidebar nav, message-list
      Scheduled/Sent views, a reading-pane detail view, and a full-page Compose)
- [x] "Login with Google" → real backend OAuth redirect → dashboard (the email/password
      fields shown in the mockup are rendered for visual fidelity but are intentionally
      inert — the backend only implements real Google OAuth per the assignment's "no mock"
      requirement, and submitting them shows an honest toast saying so)
- [x] Sidebar: user profile with avatar/name/email, dropdown for Slack connect/disconnect +
      logout, pill Compose button, Scheduled/Sent nav with live counts
- [x] Top bar: search (wired to `/api/emails/search`, debounced), status filter, refresh
- [x] Message-list rows: recipient, amber "scheduled at" badge or neutral "Sent"/red "Failed"
      badge, subject + preview snippet, star toggle (persisted via a real `starred` column
      and `PATCH /api/emails/:id/star`, not a fake client-only toggle)
- [x] Detail (reading-pane) view: sender info, full body (renders rich HTML if present,
      falls back to plain text), image attachments with filename/size, and a real cancel
      action for not-yet-sent emails (`DELETE /api/emails/:id` — removes the live BullMQ
      job and marks the row `cancelled`, it doesn't just hide it client-side)
- [x] Full-page Compose: From (sender picker), chip-based To field with paste/CSV-upload
      support ("Upload List"), Subject, Delay/Hourly-limit fields, a rich-text editor
      (bold/italic/underline/lists/indent/quote/highlight/link) with attachments, and a
      "Send Later" popover with quick date/time presets — matching the mockup's compose flow
- [x] Loading states, empty states, toast-based error handling throughout
- [x] TypeScript throughout, typed API responses/props, reusable components
      (`Avatar`, `StatusBadge`, `EmailList`, `RichTextEditor`, `SendLaterPopover`, etc.)

---

## 5. Assumptions, shortcuts & trade-offs

- **Sender model**: a "sender" is created automatically as the logged-in user's own
  Google name/email on first login, rather than building a full multi-sender
  management UI. The backend fully supports multiple senders per user
  (`senders` table, `senderId` param on the schedule API) — only the *UI* for adding
  additional senders was left out to stay in scope; the compose "From" field becomes
  a real dropdown automatically if a user has more than one sender row.
- **Rich text editor**: implemented with `contentEditable` + `document.execCommand`
  rather than pulling in a full editor framework (TipTap/Slate/etc). `execCommand` is
  deprecated but still broadly supported in evergreen browsers and was the pragmatic
  choice for matching the mockup's toolbar without a heavy new dependency; the HTML it
  produces is stored in `body_html` and sent via Nodemailer alongside a plain-text
  fallback derived from the same content.
- **Branding**: the mockup's sidebar logo ("ONB") was swapped for "RI" (ReachInbox) —
  everything else about that panel (avatar, dropdown, pill Compose button, nav layout)
  follows the reference as closely as I could get it from the screenshots.
- **Rate limit window**: fixed hour-of-day buckets rather than a strict rolling 60
  minute window (see §2.3 for the exact trade-off and the sorted-set alternative).
- **Retry/backoff**: failed sends retry 3x with exponential backoff (BullMQ's
  built-in `attempts`/`backoff`), rather than a fully custom retry policy.
- **CSV parsing**: any `.csv`/`.txt` file is scanned for anything email-shaped via
  regex rather than requiring a strict single-column CSV format — this is more
  forgiving of real-world exports (extra columns, headers, etc.).
- **Slack "channel" selection**: the connect flow requests `incoming-webhook`, which
  lets the user pick their target channel directly in Slack's own consent screen
  (Slack's simplest/most standard integration pattern), rather than building a custom
  in-app channel picker.
- **No E2E test suite** included given the time box; the emphasis was on getting the
  queueing, persistence, and rate-limiting semantics correct and clearly documented.

---

## 6. Demo checklist (for the submission video)

1. Log in with Google → land on dashboard.
2. Compose a new email, upload a small leads file, set a short start delay → Schedule.
3. Show the row appear in **Scheduled Emails**, and in the Bull-Board dashboard at
   `/admin/queues`.
4. Wait for it to send → show it move to **Sent Emails** with an Ethereal preview link.
5. **Restart demo**: schedule a batch a minute or two out, stop the worker (and
   optionally the API) mid-flight, restart both, and show the emails still send at
   their original time with no duplicates.
6. **Rate limit demo**: set `maxEmailsPerHour` very low (e.g. 2) with several
   recipients, connect Slack, and show the Slack alert firing plus the extra rows
   sliding into `rescheduled` with a next-hour `scheduled_time`.
