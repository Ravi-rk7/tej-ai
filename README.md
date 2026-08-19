# TejAi

TejAi is an AI-assisted skincare wellness SaaS. The repository contains a
Next.js frontend and an Express API backed by Supabase.

The project is currently in a 15-day production-MVP hardening cycle. A green
build means the repository compiles; it does not mean external provider flows
are ready until the launch acceptance suite passes.

## Requirements

- Node.js 22
- npm 10+
- Staging accounts for Supabase, AILabTools, OpenAI, Upstash, and Dodo Payments

## Setup

1. Copy `backend/.env.example` to `backend/.env` and add staging credentials.
2. Copy `frontend/.env.example` to `frontend/.env.local` and add the public
   staging configuration.
3. Install dependencies with `npm run install:all` from the repository root.
4. Apply the ordered SQL migrations documented in
   `backend/db/SCHEMA_SETUP.md`.
5. Run the backend and frontend in separate terminals:

```powershell
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:3000`

Backend health: `http://localhost:3001/api/health`

## Quality gate

```powershell
npm run check
npm run audit
```

CI runs backend lint/tests/audit and frontend lint/build/audit on every pull
request and push to `main`.

## Security rules

- Never commit `.env` or `.env.local` files.
- Never expose the Supabase service-role key through a `NEXT_PUBLIC_` variable.
- Browser clients may read only their own scans and subscription status.
- Subscription entitlements and scan records are written by the backend only.
- Do not log tokens, provider payloads, email addresses, or image bytes.
- Use test-mode payment credentials outside production.

See `STAGING_DEPLOYMENT.md` for the deployment runbook.

## Delivery tracking

- `docs/ISSUE_BOARD.md` is the P0/P1/P2 execution board.
- `docs/LAUNCH_CHECKLIST.md` contains the release gates that must be checked
  before production launch.
- Staging and production use distinct `*.env.<environment>.example` templates
  in both application directories. Copy a template to the local ignored env
  filename; never put real values in a committed template.
