# TejAi

Skincare routine journal using Next.js, React, Express, Supabase/PostgreSQL and Upstash. Includes private routine tracking, optional Face++ observations and an account-free sample workspace.

## Run

Requires Node.js 22 and npm. From the repository root:

```sh
npm run install:all
npm run dev:frontend
```

Open http://localhost:3000/demo for the sample workspace; no credentials are required.

For live features, copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Configure Supabase, Upstash, and two independent security/audit secrets. In Supabase, enable GitHub OAuth, use the Supabase callback URL in the GitHub OAuth app, and allow the frontend's `/auth/callback` URL. Never expose service-role or provider credentials in frontend variables.

For a fresh Supabase database, apply `backend/db/migrations/*.sql` in filename order, or apply `backend/db/schema.sql` once, never both. For existing databases, back up first and apply only missing migrations. Historical migrations preserve existing-data compatibility.

Run `npm run dev:backend` in a second terminal. Live scanning defaults off; only enable it after configuring Face++ credentials, confirming provider terms and obtaining scan consent.

## Build and deploy

```sh
npm run check    # Lint and frontend production build
npm run audit    # Production dependency audit
```

Use `render.yaml` for the backend (repository root); deploy the Next.js frontend from `frontend/` with access to `shared/`. Use each service's `.env.example` as the variable list; set `APP_ENV=production`, backend `NODE_ENV=production`, and your HTTPS frontend/API origins in the host settings. Frontend public variables are embedded at build time. Start built services with `npm --prefix backend start` and `npm --prefix frontend start`. Backend `/api/health` checks liveness; `/api/ready` checks database and throttling availability.

`frontend/` contains pages, components and browser state; `backend/` contains the API and database definitions; `shared/` contains result normalization and comparison rules. CI runs lint, build and dependency/secret checks. Automated test suites are not included.

## Limitations and attribution

Hosted OAuth and a real Face++ account still need verification. Face++ categories are cosmetic observations, not medical advice or numerical health scores. Free services can sleep or pause; the sample workspace remains independent. The configured provider endpoint is in the US.

The homepage portrait is an original AI-generated fictional adult illustration created September 11, 2026, not a real scan, user upload or treatment result. Scanning graphics use CSS/SVG; the homepage makes no vision-provider requests. No paid LLM is used.
