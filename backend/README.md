# TejAi Backend — Production Implementation

A production-grade Node.js backend for TejAi, an AI-powered skincare SaaS.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Cloudinary account
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

- Log into Supabase dashboard
- Run the SQL from `db/schema.sql` in the SQL editor
- Enable RLS policies as specified

4. **Create Cloudinary upload preset**

- Go to Cloudinary > Settings > Upload > Presets
- Create preset named `tej_ai_scan` with folder `tej_ai_scans`

5. **Start server**

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
- Returns: Glow Score, concerns, AI routine, trend
- Required: Bearer token + multipart image

### History

**`GET /api/history`** (authenticated)

- Fetch user's scan history
- Returns: Recent scans + trend data for charts

### Payments

**`POST /api/create-subscription`** (authenticated)

- Create Dodo Payments checkout session
- Body: `{ plan: "starter" | "growth" | "pro" }`

**`POST /api/webhook`** (signature verified)

- Handle Dodo webhook events
- No authentication required (signature verified)

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

- Integrates with AILabTools Skin Analysis API
- Extracts and normalizes skin metrics
- Detects concerns from API response

### `aiRoutineService.js`

- Calls OpenAI GPT-4o-mini for routine generation
- Generates beginner-friendly 3-step routines
- Handles fallback if generation fails

### `glowScoreService.js`

- Maps AILabTools `score_info.total_score` directly to Glow Score™
- Calculates trend (↑ improving / ↓ worsening / → stable)
- Compares against previous scan

### `imageService.js`

- Uploads images to Cloudinary CDN
- Validates image dimensions
- Cleans up local files after upload

### `paymentService.js`

- Dodo Payments integration
- Plan management and pricing
- Webhook signature verification

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
6. **Error Handler** → Catch and format errors

---

## 📊 Database Schema

### `skin_analysis`

- Stores all skin analysis results
- User FK, image URL, Glow Score, concerns, routine
- Indexed by user_id and created_at for fast queries

### `subscriptions`

- Tracks active subscriptions per user
- Plan, status, billing period info
- Dodo subscription ID for webhook matching

### Row-Level Security

- Users can only read/write their own rows
- Enforced at database level

---

## 🧪 Testing API Locally

### Test health endpoint

```bash
curl http://localhost:3001/api/health
```

### Test scan (with auth token)

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "image=@/path/to/image.jpg"
```

### Test history

```bash
curl http://localhost:3001/api/history \
  -H "Authorization: Bearer YOUR_JWT"
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
- ✅ Image CDN via Cloudinary
- ✅ Redis-backed rate limiting (distributed)
- ✅ Database indexes on frequently queried columns
- ✅ 15-second timeouts on external API calls
- ✅ Graceful degradation (fallback routine if OpenAI fails)

---

## 🔗 Environment Variables Reference

```
SUPABASE_URL              PostgreSQL database & auth endpoint
SUPABASE_SERVICE_ROLE_KEY Admin key for server-side operations
CLOUDINARY_CLOUD_NAME     Your Cloudinary project name
CLOUDINARY_API_KEY        Cloudinary API key
CLOUDINARY_API_SECRET     Cloudinary API secret
AILAB_API_KEY            AILabTools authentication
AILAB_API_URL            AILabTools endpoint (default provided)
OPENAI_API_KEY           OpenAI API authentication
UPSTASH_REDIS_REST_URL   Redis serverless REST URL
UPSTASH_REDIS_REST_TOKEN Redis authentication token
DODO_API_KEY             Dodo Payments API key
DODO_SECRET_KEY          Dodo Payments secret
DODO_WEBHOOK_SECRET      For webhook signature verification
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
| cloudinary            | Image CDN                 |
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
- Ensure Node.js 18+ available
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
