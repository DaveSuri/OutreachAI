# OutreachAI (Mini-SaaS)

Event-driven AI CRM for cold outreach built with Next.js, PostgreSQL, Prisma, Inngest, Resend, OpenAI, and Gemini.

## Implemented Capabilities

- Durable drip campaigns modeled as Inngest functions.
- Critical race-condition guards via optimistic concurrency (`version`) and `repliedAt` checks.
- Resend inbound webhook verification via Svix signatures.
- Human-in-the-loop draft approval queue.
- Voice-native assistant scaffold with tool calls:
  - `get_dashboard_stats`
  - `query_hot_leads`

## Tech Stack

- Next.js 14 App Router
- Prisma + PostgreSQL
- Inngest
- Resend
- OpenAI (`gpt-4o-mini`)
- Google Gemini (`gemini-1.5-flash`)

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create env file.

```bash
cp .env.example .env.local
```

3. Start local PostgreSQL (Docker).

```bash
docker compose up -d postgres
```

4. Initialize database.

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

5. Run app and Inngest.

Single command:

```bash
npm run dev:stack
```

Or in two terminals:

```bash
npm run dev
npm run inngest:dev
```

6. Open dashboard.

- [http://localhost:3000](http://localhost:3000)

## Production Run

1. Validate production environment values.

```bash
npm run env:check:prod
```

2. Build the app.

```bash
npm run build
```

3. Set required production auth env vars.

```bash
export BASIC_AUTH_USERNAME="admin"
export BASIC_AUTH_PASSWORD="change-me"
```

4. Start production server.

```bash
npm run start
```

5. Access with basic auth credentials.

```bash
curl -u "$BASIC_AUTH_USERNAME:$BASIC_AUTH_PASSWORD" http://localhost:3000
```

## Live Deploy (Vercel + Resend + Inngest)

One-command live deployment:

```bash
npm run deploy:live
```

The script performs:

- Production env validation (`scripts/check-env.mjs`)
- Vercel production deployment
- Post-deploy smoke checks (`/api/inngest`, `/api/stats`)
- Resend webhook creation/update for `APP_URL/api/webhooks/resend`
- Inngest cloud endpoint verification for key presence and function sync

Required variables for `npm run deploy:live`:

- `DATABASE_URL`
- `APP_URL` (must be `https://...`)
- `BASIC_AUTH_USERNAME`
- `BASIC_AUTH_PASSWORD`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_FROM`
- `ALERT_EMAIL_TO`
- `OPENAI_API_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (only if `.vercel/project.json` is missing)

Optional:

- `GOOGLE_GEMINI_API_KEY`
- `RESEND_WEBHOOK_EVENTS` (default: `email.received`)

## Core API Surface

- `POST /api/campaigns` create campaign with default sequence
- `POST /api/campaigns/upload` ingest CSV/JSON leads and trigger `campaign/start`
- `POST /api/webhooks/resend` verify inbound email and emit `lead/reply.received`
- `POST /api/drafts/[id]/approve` emit `draft/approved`
- `GET /api/stats` dashboard stats
- `GET /api/hot-leads` high priority leads
- `POST /api/voice/tools` voice assistant tool router
- `GET|POST /api/inngest` Inngest serve endpoint

## Inngest Workflows

- `campaign-workflow`
  - Trigger: `campaign/start`
  - Handles `AI_RESEARCH`, `EMAIL`, and `WAIT` steps
  - Wait step interruption: `lead/reply.received`
- `reply-handling`
  - Trigger: `lead/reply.received`
  - Sentiment analysis + draft generation + admin alert
- `send-approved-draft`
  - Trigger: `draft/approved`
  - Double-check lock before send

## Security Notes

- Keep all secrets server-side in env vars.
- Verify `EMAIL_FROM` in Resend before production use.
- Protect approval endpoints with RBAC middleware before production rollout.
