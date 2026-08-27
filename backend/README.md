# TejAi Backend — Production Implementation

> **Status:** production hardening is in progress. Use the repository-root
> `README.md`, ordered database migrations, and CI results as the current source
> of truth. External scan and payment flows are not launch-ready until their
> acceptance tests pass.

Node.js backend for TejAi, an AI-powered skincare SaaS.

## 🚀 Quick Start

### Prerequisites

- Node.js 22
- npm or yarn
- Supabase account
- OpenAI API key
- Upstash Redis account
- Dodo Payments account
- AILabTools Skin Analysis Pro API key

### Installation

1. **Clone and install**

```bash
cd backend
npm install
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Set up database**

- Log into the Supabase dashboard.
- For an existing environment, apply every file in `db/migrations/` in
  timestamp order. Do not replace migration history with the schema snapshot.
- Use `db/schema.sql` only as a readable snapshot for a brand-new empty project.
- Verify the service-role-only billing access described in
  `db/SCHEMA_SETUP.md`.

4. **Start server**

```bash
npm run dev  # Development with nodemon
npm start    # Production
```

The server will start on `http://localhost:3001`

---

## 📁 Project Structure

```
backend/
├── controllers/        # Route handlers
├── routes/            # Express route definitions
├── services/          # Business logic layer
├── middleware/        # Express middleware
├── utils/             # Helper functions & logging
├── config/            # Environment configuration
├── db/                # Database schema
└── server.js          # Express app entry point
```

---

## 🔌 API Endpoints

### Scan Analysis

**`POST /api/scan`** (authenticated)

- Upload image and get skin analysis
- Returns: Glow Score, skin type, concern details, safety-checked AI routine, and optional image guidance
- Required: Bearer token + multipart image

### History

**`GET /api/history`** (authenticated)

- Fetch the authenticated user's scan history with bounded cursor pagination.
- Query: `limit` (1–25, default 12) and opaque `cursor` from `pageInfo.nextCursor`.
- Returns `{ schemaVersion, items, pageInfo }`; each item contains only `scanId`,
  `createdAt`, `glowScore`, `skinType`, and display-safe concern labels.

### Dashboard

**`GET /api/dashboard`** (authenticated)

- Returns the latest saved scan, real score trend points, current plan, UTC-month
  usage, remaining scans, and the next quota reset.
- Responses are private and sent with `Cache-Control: private, no-store`.
- Both dashboard and history queries filter by the authenticated `user_id`; raw
  provider payloads and image fields are never returned.

### Payments

**`POST /api/billing/checkout`** (authenticated)

- Creates a Dodo Checkout Session from a server-owned product mapping.
- Requires a UUID `Idempotency-Key` header and the strict body
  `{ plan: "starter" | "growth" | "pro" }`.
- Returns only `checkoutUrl`, `checkoutSessionId`, and `reused` with private,
  no-store caching.
- Checkout is disabled unless `BILLING_CHECKOUT_ENABLED=true` and uses a
  fail-closed payment-specific rate limit.

**`GET /api/billing/subscription`** (authenticated)

- Returns only the authenticated owner's plan, status, scan limit, period end,
  cancellation flag, and update time.
- A missing entitlement safely resolves to the Free plan.

**`GET /api/billing/return` / `GET /api/billing/cancel`**

- Public, non-mutating `303` relays to fixed Settings URLs.
- Provider query parameters are discarded and never treated as payment proof.

**`POST /api/create-subscription` / `POST /api/webhook`**

- Legacy paths are fail-closed. The signed webhook is `/api/billing/webhook`;
  verified lifecycle events are applied idempotently by the Day 9 database RPC.

### Privacy and deletion

**`GET /api/privacy/status` / `POST /api/privacy/consent` /
`POST /api/privacy/consent/withdraw`** (authenticated)

- Reads, grants, or withdraws the current versioned face-scan consent.
- Consent is enforced before the scan upload parser or any quota/provider work.

**`DELETE /api/scans/:scanId`** (authenticated)

- Deletes one owner-scoped saved result without refunding monthly quota.
- Missing and foreign IDs have the same privacy-safe response.

**`DELETE /api/account`** (authenticated)

- Requires the exact confirmation phrase and current password reauthentication.
- Immediately cancels a linked non-terminal Dodo subscription before hard Auth
  deletion and cascading user-data deletion.
- See `../docs/PRIVACY_DELETION_CONTRACT.md` for ordering and staging gates.

### Health

**`GET /api/health`**

- Service health check

---

## 🔐 Security Features

- **JWT Authentication**: Supabase Auth integration
- **Row-Level Security (RLS)**: PostgreSQL RLS enabled
- **Rate Limiting**: 10 requests/minute per user (Upstash Redis)
- **Scan Limits**: Based on subscription plan
- **Input Validation**: Zod schema validation
- **CORS**: Configured to frontend URL only
- **Environment Variables**: All secrets in .env

---

## 🧠 Core Services

### `skinAnalysisService.js`

- Integrates with AILabTools Skin Analysis Pro v1.7.1
- Validates and normalizes the provider response without applying product thresholds

### `skinInsightsService.js`

- Uses the provider `total_score` directly as Glow Score
- Centralizes the ten concern mappings and severity thresholds
- Produces sanitized metrics and structured concern details

### `aiRoutineService.js`

- Calls pinned GPT-4o mini with strict JSON Schema Structured Outputs
- Sends only derived skin type and concern key/severity data
- Converts allowlisted catalog tokens into a safe routine with deterministic safety notes and fallback behavior

### `glowScoreService.js`

- Maps AILabTools `score_info.total_score` directly to Glow Score™
- Calculates trend (↑ improving / ↓ worsening / → stable)
- Compares against previous scan

### `imageService.js`

- Verifies JPEG signatures and decoded content
- Bounds image size and resolution before provider calls
- Normalizes orientation, strips metadata, and clears transient buffers

### `paymentService.js`

- Creates idempotent Dodo Checkout Sessions from server-owned products.
- Pins test/live API and checkout origins and validates provider responses.
- Does not process payment confirmation or mutate entitlements; signed Standard
  Webhooks remain Day 9 work.

### `supabaseService.js`

- Database operations for scans and subscriptions
- Query optimized with indexes
- RLS-compliant operations

---

## ⚡ Middleware Pipeline

1. **CORS** → Enable cross-origin requests
2. **Body Parser** → Parse JSON/form data
3. **Auth** → Verify Supabase JWT (if route protected)
4. **Rate Limit** → Check 10 req/min per user
5. **Scan Limit** → Check subscription scan quota
6. **Image Upload** → Bound, validate, and normalize one in-memory JPEG
7. **Error Handler** → Catch and format errors

---

## 📊 Database Schema

### `skin_analysis`

- Stores all skin analysis results
- User FK, Glow Score, concerns, and routine; raw images are not retained
- Indexed by user_id and created_at for fast queries

### `subscriptions`

- Tracks active subscriptions per user
- Plan, status, billing period info
- Dodo subscription ID for webhook matching

### Row-Level Security

- Authenticated browser users can read only their own scan rows and cannot
  write them directly.
- Subscription and checkout-attempt tables are service-role-only; the browser
  reads display-safe status through the authenticated billing API.
- Enforcement combines PostgreSQL RLS with explicit table/function grants.

---

## 🧪 Testing API Locally

### Test health endpoint

```bash
curl http://localhost:3001/api/health
```

### Test scan (with auth token)

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}" \
  -F "image=@/path/to/image.jpg"
```

### Test history

```bash
curl http://localhost:3001/api/history \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}"
```

---

## 🚨 Error Handling

All errors return consistent JSON format:

```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE"
}
```

Common error codes:

- `UNAUTHORIZED` → Missing/invalid JWT
- `RATE_LIMIT_EXCEEDED` → 10 requests/min exceeded
- `SCAN_LIMIT_REACHED` → Subscription scan quota exceeded
- `SCAN_FAILED` → Skin analysis failed
- `VALIDATION_ERROR` → Request validation failed

---

## 📝 Logging

Winston logger outputs to:

- **Console** → Real-time logs (all levels)
- **logs/error.log** → Error-level logs only
- **logs/all.log** → All logs

Log levels: error, warn, info, http, debug

---

## 🎯 Performance Optimizations

- ✅ Parallel API calls where possible
- ✅ Memory-bounded transient JPEG processing
- ✅ Redis-backed rate limiting (distributed)
- ✅ Database indexes on frequently queried columns
- ✅ 15-second timeouts on external API calls
- ✅ Graceful degradation (fallback routine if OpenAI fails)

---

## 🔗 Environment Variables Reference

```
SUPABASE_URL              PostgreSQL database & auth endpoint
SUPABASE_SERVICE_ROLE_KEY Admin key for server-side operations
AILABTOOLS_API_KEY       AILabTools authentication
AILAB_API_URL            AILabTools endpoint (default provided)
OPENAI_API_KEY           OpenAI API authentication
UPSTASH_REDIS_REST_URL   Redis serverless REST URL
UPSTASH_REDIS_REST_TOKEN Redis authentication token
DODO_API_KEY             Dodo Payments API key
DODO_WEBHOOK_SECRET      Reserved for the signed Day 9 webhook handler; Day 8 route is disabled
DODO_ENVIRONMENT         test_mode outside production; live_mode in production
DODO_PRODUCT_ID_STARTER  Server-owned Starter recurring product ID
DODO_PRODUCT_ID_GROWTH   Server-owned Growth recurring product ID
DODO_PRODUCT_ID_PRO      Server-owned Pro recurring product ID
DODO_API_BASE_URL        Exact canonical API origin for the selected Dodo mode
DODO_CHECKOUT_RETURN_URL Fixed backend /api/billing/return relay URL
DODO_CHECKOUT_CANCEL_URL Fixed backend /api/billing/cancel relay URL
BILLING_CHECKOUT_ENABLED Checkout kill switch (defaults to false)
PRIVACY_NOTICE_VERSION  Current versioned face-scan privacy notice
PRIVACY_CONSENT_ENFORCEMENT Fail-closed consent switch; must be true in production
PRIVACY_AUDIT_RETENTION_DAYS Pseudonymous deletion evidence retention (30-3650)
DELETION_AUDIT_HMAC_SECRET Independent backend-only HMAC key (32+ characters in staging/production)
APP_ENV                  development/test/staging/production deployment boundary
API_BASE_URL             Canonical public backend origin
FRONTEND_URL             CORS origin (e.g., http://localhost:3000)
PORT                     Server port (default: 3001)
NODE_ENV                 Environment (development/production)
```

---

## 📦 Dependencies Summary

| Package               | Purpose                   |
| --------------------- | ------------------------- |
| express               | Web framework             |
| @supabase/supabase-js | PostgreSQL + Auth         |
| @upstash/ratelimit    | Distributed rate limiting |
| @upstash/redis        | Redis serverless client   |
| axios                 | HTTP requests             |
| sharp                  | Safe image normalization  |
| zod                   | Input validation          |
| multer                | File upload handling      |
| winston               | Logging                   |
| cors                  | Cross-origin requests     |
| dotenv                | Environment variables     |

---

## 🛠️ Development Commands

```bash
npm run dev       # Start with auto-reload (nodemon)
npm start         # Start production server
npm run lint      # Check code quality
npm run format    # Auto-format code
```

---

## 🚀 Deployment

### Prepare for production

1. Set `NODE_ENV=production` in .env
2. Ensure all secrets are configured
3. Set up database backups
4. Enable monitoring/logging

### Deploy to cloud

- Platforms: Vercel, Railway, Render, Heroku, AWS, etc.
- Ensure Node.js 22 is selected
- Install dependencies: `npm install --production`
- Run: `npm start`

---

## 🔗 Integration with Frontend

Frontend should:

1. Authenticate via Supabase Auth
2. Pass JWT in `Authorization: Bearer <token>` header
3. Send multipart form data for image uploads
4. Handle response format: `{ success, data/error, code }`

Example scan request:

```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);

const response = await fetch("/api/scan", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
const json = await response.json();
```

---

## 📞 Support & Issues

- Check logs in `logs/` directory
- Verify all .env variables are set correctly
- Ensure Supabase RLS policies are enabled
- Test health endpoint first: `GET /api/health`

---

**Built with ❤️ for TejAi**
