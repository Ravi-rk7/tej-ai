# Deployment & Setup Guide for TejAi Backend

> **Legacy notes:** use the repository-root `STAGING_DEPLOYMENT.md` for the
> active deployment process. Provider instructions below may not match current
> API contracts.

Historical step-by-step setup notes for the TejAi backend.

---

## 📋 Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [Service Configuration](#service-configuration)
3. [Database Setup](#database-setup)
4. [Testing Endpoints](#testing-endpoints)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

---

## 🔧 Local Development Setup

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

This will install all packages from `package.json`:

- Express, CORS, Multer for server
- Supabase SDK for database
- Upstash Redis for rate limiting
- Sharp for transient image normalization
- Zod for validation
- Winston for logging
- And others...

### Step 2: Create Environment File

```bash
# Copy template to .env
cp .env.example .env

# Edit with your credentials
code .env  # Or use your editor
```

### Step 3: Create Log Directory

```bash
mkdir -p logs
```

### Step 4: Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3001` with auto-reload (nodemon).

To verify it's running:

```bash
curl http://localhost:3001/api/health
# Response: { "success": true, "message": "API is healthy" }
```

---

## 🔑 Service Configuration

### 1. Supabase Setup

#### Create Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click "New Project"
4. Fill in project name, database password, region (choose closest to you)
5. Click "Create new project" (takes ~2 minutes)

#### Get Credentials

1. Go to Project Settings → API
2. Copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
3. Add to `.env`

⚠️ **WARNING**: Never use SERVICE_ROLE_KEY on frontend!

---

### 2. Transient image processing

No image-hosting account or upload preset is required. The API accepts one
authenticated `multipart/form-data` field named `image`, validates a JPG/JPEG
within the 8 MB boundary, normalizes it in bounded memory, sends the transient
bytes directly to AILabTools, and clears both source and normalized buffers.

---

### 3. AILabTools Setup

#### Get API Key

1. Go to AILabTools dashboard
2. Navigate to API Settings
3. Generate or copy your API key
4. Add to `.env`:
   ```
   AILABTOOLS_API_KEY=your_key
   AILAB_API_URL=https://www.ailabapi.com/api/portrait/analysis/skin-analysis-pro
   ```

#### Test Connection

Use `npm run test:provider -- <consented-jpeg-directory>` only with explicitly
consented staging portraits. That runner enforces the current provider contract
and reports usage without printing credentials or image data.

---

### 4. OpenAI Setup

#### Create Account & Get Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up / Log in
3. Go to API keys → Create new secret key
4. Copy the key (shown only once!)
5. Add to `.env`:
   ```
   OPENAI_API_KEY=sk-proj-xxx
   ```

#### Set Usage Limits (Important!)

1. Go to Billing → Usage limits
2. Set "Hard limit" to prevent unexpected charges
3. Example: $10/month for testing

---

### 5. Upstash Redis Setup

#### Create Redis Instance

1. Go to [console.upstash.com](https://console.upstash.com)
2. Sign up / Log in
3. Click "Create Database"
4. Choose "Redis"
5. Select region (close to your users)
6. Click "Create"

#### Get Credentials

1. Go to your database
2. Click "REST API"
3. Copy:
   - `UPSTASH_REDIS_REST_URL` (e.g., `https://xxx.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (starts with `AZ...`)
4. Add to `.env`

#### Why Redis?

- Rate limiting: 10 requests/minute per user
- Distributed (works across multiple servers)
- Serverless (no infrastructure to manage)

---

### 6. Dodo Payments Setup

#### Create Account

1. Go to Dodo Payments dashboard
2. Sign up as merchant
3. Set up business details

#### Get Credentials

1. Go to API Settings
2. Generate the environment-specific API key.
3. Reserve a staging-only webhook secret in the secret manager because runtime
   validation requires it when webhooks are enabled. Keep the Day 9 signed
   webhook switch off until the migration and verification gates pass.
4. Add the values to `.env`:
   ```
   APP_ENV=staging
   DODO_ENVIRONMENT=test_mode
   BILLING_CHECKOUT_ENABLED=false
   DODO_API_BASE_URL=https://test.dodopayments.com
   DODO_API_KEY=<test-mode-key>
   DODO_WEBHOOK_SECRET=xxx
   DODO_BUSINESS_ID=<dodo-business-id>
   DODO_PRODUCT_ID_STARTER=<test-starter-product>
   DODO_PRODUCT_ID_GROWTH=<test-growth-product>
   DODO_PRODUCT_ID_PRO=<test-pro-product>
   DODO_CHECKOUT_RETURN_URL=https://api-staging.example.com/api/billing/return
   DODO_CHECKOUT_CANCEL_URL=https://api-staging.example.com/api/billing/cancel
   PRIVACY_NOTICE_VERSION=face-scan-2026-01
   PRIVACY_CONSENT_ENFORCEMENT=true
   PRIVACY_AUDIT_RETENTION_DAYS=365
   DELETION_AUDIT_HMAC_SECRET=<independent-32-plus-character-secret>
   ```

Staging must use `test_mode`; production must use `live_mode`. The server pins
the matching official Dodo API origin and rejects mixed modes, duplicate product
IDs, non-canonical application origins, and callback URL overrides. Leave the
checkout kill switch off until the migration, product verification, and staging
gates pass.

#### Create Payment Plans

In `services/paymentService.js`, plans are defined:

- **Free**: 1 scan/month
- **Starter**: 15 scans/month
- **Growth**: 30 scans/month
- **Pro**: 50 scans/month

---

## 🗄️ Database Setup

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project
2. Left sidebar → "SQL Editor"
3. Click "New Query"

### Step 2: Apply Ordered Migrations

Apply every file in `backend/db/migrations/` in timestamp order, through
`202608280002_day_10_privacy_deletion.sql`. Migration files are the source of
truth for deployed environments. Use `backend/db/schema.sql` only as a readable
snapshot for a brand-new empty project. See `backend/db/SCHEMA_SETUP.md` for the
exact order and access checks.

### What Gets Created?

| Table                       | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `skin_analysis`             | Owner-readable scan results                          |
| `subscriptions`             | Service-role-only entitlement state                  |
| `billing_checkout_attempts` | Private checkout idempotency and provider session state |
| `payment_webhook_events`    | Reserved replay records for the signed Day 9 lifecycle |
| `scan_quota_reservations`   | Atomic monthly scan reservations and refunds |
| `privacy_consent_events`    | Append-only, versioned face-scan consent history |
| `privacy_deletion_audits`   | Keyed-hash deletion lifecycle evidence |
| `deleted_billing_subjects`  | Keyed billing tombstones for late signed events |

### Step 3: Verify Tables

1. Go to Table Editor
2. Should see:
   - `skin_analysis`
   - `subscriptions`
   - `billing_checkout_attempts`
   - `payment_webhook_events`
   - `scan_quota_reservations`
   - `privacy_consent_events`
   - `privacy_deletion_audits`
   - `deleted_billing_subjects`
3. Click each table to verify columns exist

### Step 4: Verify RLS Policies

1. Confirm RLS is enabled on all eight public tables.
2. Run the staging isolation script described in `backend/db/SCHEMA_SETUP.md`.
3. Confirm browser users can read only their own scans and cannot directly read
   or mutate subscriptions, checkout attempts, or the private checkout-claim
   function.
4. Confirm browser roles cannot read or mutate the three privacy/deletion
   tables or execute Day 10 deletion functions.

Deploy Day 10 in this order: backward-compatible frontend, database migration,
backend privacy/deletion secret and configuration, then backend application.
Run `docs/PRIVACY_DELETION_CONTRACT.md` in staging before marking the release
complete. Do not deploy the Day 10 legal release until verified business and
legal configuration is present.

---

## 🧪 Testing Endpoints

### Prerequisites

- Backend running on `http://localhost:3001`
- Valid Supabase JWT token (get by authenticating via Supabase)
- Test image file (JPG/JPEG, max 8 MB)

### 1. Health Check (No Auth Required)

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "API is healthy"
}
```

### 2. Scan Image (Requires Auth)

First, get a JWT token from Supabase Auth (or use existing user token).

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}" \
  -F "image=@/path/to/image.jpg"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "glowScore": 78,
    "trend": "↑",
    "skinType": "oily",
    "concerns": ["Mild Acne", "Uneven Tone"],
    "routine": {
      "morning": [...],
      "evening": [...]
    },
    "weeklyImprovement": 5,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### 3. Get Scan History (Requires Auth)

```bash
curl http://localhost:3001/api/history \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "recentScans": [...],
    "trendData": [...],
    "totalScans": 5
  }
}
```

### 4. Create Checkout Session (Requires Auth)

```bash
curl -X POST http://localhost:3001/api/billing/checkout \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-4111-8111-111111111111" \
  -d '{"plan": "starter"}'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://test.checkout.dodopayments.com/session/...",
    "checkoutSessionId": "cks_...",
    "reused": false
  }
}
```

Read the server-owned status with `GET /api/billing/subscription`. Return and
cancel redirects are not payment confirmation; Day 9 Standard Webhooks are the
only path that may update subscription entitlements. The legacy
`/api/create-subscription` and `/api/webhook` routes intentionally return `503`.

---

## 🚀 Production Deployment

### Platform Options

- **Vercel**: Easiest for Node.js
- **Railway**: Simple & affordable
- **Render**: Great for long-running servers
- **Heroku**: Legacy option (paid)
- **AWS**: Most powerful but complex
- **DigitalOcean**: VPS alternative

### General Steps

#### 1. Prepare Repository

```bash
# Ensure .gitignore excludes .env
# Add environment variables to platform secrets
# Verify all code is committed
git push origin main
```

#### 2. Connect to Platform

- Link your GitHub repo
- Grant permission to repo

#### 3. Set Environment Variables

On deployment platform:

1. Add all variables from `.env.example`
2. Fill in actual production values
3. Ensure `NODE_ENV=production`

#### 4. Configure Build Command

```
npm install --production
```

#### 5. Configure Start Command

```
npm start
```

#### 6. Deploy

- Click "Deploy"
- Wait for build completion
- Verify with health check:
  ```
  curl https://your-backend.com/api/health
  ```

### Example: Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from backend directory
cd backend
vercel
```

Then follow interactive prompts.

### Example: Railway Deployment

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Connect GitHub repo
4. Select `backend/` folder
5. Add environment variables
6. Deploy

---

## 🔒 Security Checklist

- [ ] All `.env` values filled (no default values in production)
- [ ] `APP_ENV=production`, `DODO_ENVIRONMENT=live_mode`, and the exact live API origin agree
- [ ] Three Dodo product IDs are present, distinct, recurring, and verified in the selected environment
- [ ] Checkout return/cancel URLs are the fixed backend relay URLs
- [ ] `BILLING_CHECKOUT_ENABLED` remains false until the staging gates pass
- [ ] `PRIVACY_CONSENT_ENFORCEMENT=true` and the notice version matches the frontend
- [ ] The independent deletion-audit HMAC secret is at least 32 characters and stored only in backend secrets
- [ ] Day 10 privacy tables/functions are service-role-only and the deletion acceptance journey passes
- [ ] `NODE_ENV=production` on production server
- [ ] CORS `FRONTEND_URL` points to your domain (not localhost)
- [ ] Supabase RLS policies enabled
- [ ] API keys rotated monthly
- [ ] HTTPS enabled (most platforms auto-enable)
- [ ] Database backups configured
- [ ] Error logs monitored
- [ ] Rate limits tested
- [ ] Transient upload rejection matrix verified

---

## 🐛 Troubleshooting

### Server won't start

**Symptoms**: "Port already in use" or "Cannot find module"

**Solutions**:

```bash
# Check if port 3001 is in use
lsof -i :3001  # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Database connection fails

**Symptoms**: "ECONNREFUSED" or timeout errors

**Solutions**:

1. Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Ensure Supabase project is running (check dashboard)
3. Test connection:
   ```bash
   curl SUPABASE_URL
   ```

### Image upload fails

**Symptoms**: JPG upload is rejected before analysis

**Solutions**:

1. Check the file is a valid JPG/JPEG, not only renamed as one.
2. Verify the file is no larger than 8 MB.
3. Verify dimensions are at least 200x200px and no side exceeds 8192px.
4. Review the stable `IMAGE_*` error code returned by the API.

### Rate limiting too strict

**Symptoms**: "429 Too Many Requests" immediately

**Solutions**:

1. Verify Upstash Redis credentials
2. Check Redis instance is active (console.upstash.com)
3. Test with longer intervals between requests

### AI generation fails

**Symptoms**: "500 Internal Server Error" on scan

**Solutions**:

1. Check `OPENAI_API_KEY` is valid
2. Verify API key has credits (platform.openai.com)
3. Test with simpler concern list
4. Check error logs in `logs/error.log`

### Skin analysis API errors

**Symptoms**: "AILab API request failed"

**Solutions**:

1. Verify `AILAB_API_KEY` is current
2. Check if API endpoint URL is correct
3. Test with valid face image (front-facing, well-lit)
4. Check AILab documentation for image requirements

---

## 📞 Support

- **Logs**: Check `logs/error.log` for detailed errors
- **API Health**: `GET /api/health` returns server status
- **Environment**: Verify all `.env` variables with `.env.example`
- **Database**: Check Supabase dashboard for table status
- **Services**: Verify each external service dashboard is accessible

---

## 🎯 Next Steps After Setup

1. **Test all endpoints** (see Testing Endpoints section)
2. **Connect frontend** to backend API
3. **Implement and verify signed Day 9 webhooks before registering a Dodo target**
4. **Set up monitoring** (error tracking, uptime monitoring)
5. **Load testing** to ensure performance at scale
6. **Deploy to production** when ready

---

**Happy deploying! 🚀**
