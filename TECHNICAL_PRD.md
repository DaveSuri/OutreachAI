# Technical PRD: OutreachAI (Current Implementation)

Version: 1.0.1  
Type: Event-Driven AI CRM  
Status: Source of Truth for current codebase

## 1. Core Architecture
- Frontend: Next.js 14 + React + custom CSS (`/Users/devanshsuri/Downloads/files/app/globals.css`)
- Auth: Clerk (`/Users/devanshsuri/Downloads/files/app/layout.tsx`, `/Users/devanshsuri/Downloads/files/middleware.ts`)
- Database: PostgreSQL + Prisma (`/Users/devanshsuri/Downloads/files/prisma/schema.prisma`)
- Orchestration: Inngest durable workflows (`/Users/devanshsuri/Downloads/files/inngest/functions`)
- AI:
  - OpenAI for outbound and reply drafting (`/Users/devanshsuri/Downloads/files/lib/ai/openai.ts`)
  - Gemini for voice tool selection/response (`/Users/devanshsuri/Downloads/files/lib/ai/gemini.ts`)
- Email: Resend outbound + inbound webhook (`/Users/devanshsuri/Downloads/files/lib/email/resend.ts`, `/Users/devanshsuri/Downloads/files/app/api/webhooks/resend/route.ts`)

## 2. Outbound Workflow (Cold Outreach)
Trigger: `campaign/start`

1. Lead ingestion:
- API: `POST /api/campaigns/upload`
- Upserts leads by `(email, campaignId)`
- Accepts CSV header aliases (`first_name`, `First Name`, `organization`, etc.)
- Enforces max per-request ingestion via `MAX_UPLOAD_LEADS` (default `5000`)
- New leads emit `campaign/start`

2. Campaign workflow (`campaign-workflow`):
- Loads lead + sequence
- Step guard before each step: abort if `status=REPLIED` or `repliedAt != null`
- `AI_RESEARCH`: runs `runAiResearch` and updates `aiContext`
- `EMAIL`: generates via OpenAI `generateColdEmail`, sends via Resend, logs `EmailLog`
- Uses optimistic concurrency on lead update (`version` in `updateMany` where clause)
- `WAIT`: uses `step.sleep()` and then post-sleep lead guard
- Demo behavior: when `DEMO_MODE=true` (default), wait durations are compressed to `DEMO_WAIT_MINUTES` (default `1`)
- Final state: marks lead `COMPLETED` if uninterrupted

## 3. Inbound Reply Workflow
Trigger path: Resend webhook -> `POST /api/webhooks/resend`

1. Webhook processing:
- Svix signature verification when `RESEND_WEBHOOK_SECRET` exists
- Extracts sender email and body
- Atomic update: set lead `REPLIED`, set `repliedAt`, increment `version` (only if not already replied)
- Emits `lead/reply.received` when update succeeds

2. Reply handling workflow (`reply-handling`):
- Loads lead context
- Sentiment analysis via OpenAI
- Draft generation via OpenAI `generateDraftResponse`
- Stores `DraftResponse` as `PENDING_APPROVAL`
- Sends admin notification to `ALERT_EMAIL_TO`

## 4. Human-in-the-Loop Approval
1. UI:
- Approvals queue in dashboard (`/Users/devanshsuri/Downloads/files/components/OutreachWorkspace.tsx`)

2. Actions:
- Approve: `POST /api/drafts/[id]/approve` -> emits `draft/approved`
- Reject: `POST /api/drafts/[id]/reject` -> marks draft `REJECTED`
- Generate (async): `POST /api/ai/generate` -> emits `ai/draft.generate`
- Simulate reply (testing): `POST /api/test/simulate-reply` -> marks lead replied + emits `lead/reply.received`

3. Approved-send workflow (`send-approved-draft`):
- Loads draft + lead
- Final race guard: if `lead.repliedAt > draft.createdAt`, rejects as stale
- Sends via Resend
- Updates:
  - draft -> `APPROVED`
  - lead -> `CONTACTED`
  - inserts `EmailLog`

## 5. Voice Assistant Flow (Current)
- UI voice/text entry: `/Users/devanshsuri/Downloads/files/components/GeminiChat.tsx`
- Voice capture via browser SpeechRecognition (not Gemini Live PCM websocket)
- API: `POST /api/voice/tools`
- Tool selection:
  - Gemini function-calling when available
  - heuristic fallback otherwise
- Tools:
  - `get_dashboard_stats`
  - `query_hot_leads`

## 6. Data Model Relationships
- `Campaign (1) -> Lead (many)`
- `Campaign (1) -> SequenceStep (many)`
- `Lead (1) -> EmailLog (many)`
- `Lead (1) -> DraftResponse (many)`
- `Lead (1) -> InboundEmail (many)`

Key concurrency fields on `Lead`:
- `version` (optimistic concurrency)
- `repliedAt` (hard stop guard)

## 7. Event Surface
- `campaign/start`
- `lead/reply.received`
- `draft/approved`
- `ai/draft.generate`

## 8. API Surface
- `POST /api/campaigns`
- `POST /api/campaigns/upload`
- `POST /api/campaigns/[id]/activate`
- `POST /api/emails/send`
- `POST /api/ai/generate`
- `POST /api/webhooks/resend`
- `POST /api/test/simulate-reply`
- `POST /api/drafts/[id]/approve`
- `POST /api/drafts/[id]/reject`
- `GET /api/stats`
- `GET /api/hot-leads`
- `POST /api/voice/tools`
- `GET|POST /api/inngest`

## 9. Production Requirements
- Vercel deployment
- PostgreSQL reachable via `DATABASE_URL`
- Clerk keys configured
- Resend domain verified for non-test delivery
- Inngest cloud keys configured and functions synced
- OpenAI key for generation flows
- Gemini key optional (voice fallback works without it)
