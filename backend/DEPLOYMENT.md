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
   AILAB_API_KEY=your_key
   AILAB_API_URL=https://api.ailabtools.com/v1
   ```

#### Test Connection

```bash
curl -X POST https://api.ailabtools.com/v1/skin-analysis \
  -H "Authorization: Bearer ${TEJAI_PROVIDER_KEY}" \
  -F "image=@test_image.jpg"
```

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
2. Generate API keys:
   - `Public Key`
   - `Secret Key`
3. Generate Webhook Secret
4. Add to `.env`:
   ```
   DODO_API_KEY=xxx
   DODO_SECRET_KEY=xxx
   DODO_WEBHOOK_SECRET=xxx
   ```

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

### Step 2: Run Schema

1. Copy entire content of `backend/db/schema.sql`
2. Paste into SQL editor
3. Click "Run" (or Cmd+Enter)
4. Wait for success message

### What Gets Created?

| Table           | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `skin_analysis` | Stores scan results, Glow Scores, concerns, routines |
| `subscriptions` | User subscription status and plan                    |

### Step 3: Verify Tables

1. Go to Table Editor
2. Should see:
   - `skin_analysis` (empty)
   - `subscriptions` (empty)
3. Click each table to verify columns exist

### Step 4: Verify RLS Policies

1. Go to SQL Editor → "Home"
2. Run:
   ```sql
   SELECT * FROM auth.rules LIMIT 10;
   ```
3. Should see RLS policies are enabled

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

### 4. Create Subscription (Requires Auth)

```bash
curl -X POST http://localhost:3001/api/create-subscription \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"plan": "starter"}'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.dodo.com/session/..."
  }
}
```

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
3. **Configure webhooks** for Dodo Payments
4. **Set up monitoring** (error tracking, uptime monitoring)
5. **Load testing** to ensure performance at scale
6. **Deploy to production** when ready

---

**Happy deploying! 🚀**
