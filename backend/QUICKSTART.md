# 🚀 TejAi Backend - Quick Start (5 Minutes)

## ⚡ TL;DR - Get Running in 5 Steps

### 1️⃣ Install Dependencies

```bash
cd backend
npm install
```

_Takes ~2-3 minutes, installs all 13 packages_

### 2️⃣ Create .env File

```bash
cp .env.example .env
# Edit .env and fill in your credentials
```

**Need credentials? Quick links:**

- [Supabase](https://supabase.com) → Create project → Copy API keys
- [OpenAI](https://platform.openai.com) → API keys → Create key
- [Upstash](https://console.upstash.com) → Create Redis → Copy REST URL/Token
- [AILabTools](https://www.ailabtools.com) → API key
- [Dodo Payments](https://dodopayments.com) → Test-mode API keys and products

### 3️⃣ Apply Database Migrations

- Go to [Supabase Dashboard](https://app.supabase.com)
- Select your project → SQL Editor
- Apply every file in `backend/db/migrations/` in timestamp order, through
  `202608280001_day_9_billing_webhooks_quotas.sql`.
- Follow `backend/db/SCHEMA_SETUP.md` for the required RLS verification.
- Use `backend/db/schema.sql` only as a snapshot for a brand-new empty project,
  never in place of ordered migrations for an existing environment.

### 4️⃣ Start Development Server

```bash
npm run dev
```

Starts on `http://localhost:3001`

### 5️⃣ Verify It Works

```bash
curl http://localhost:3001/api/health
```

Response should be:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-08-23T00:00:00.000Z"
  }
}
```

---

## 📦 What You Just Built

```
backend/
├── 📡 API Endpoints
│   ├── POST /api/scan           → Analyze skin image
│   ├── GET /api/history         → Fetch scan history
│   ├── POST /api/billing/checkout → Idempotent Checkout Session
│   ├── GET /api/billing/subscription → Owner billing status
│   ├── GET /api/billing/return|cancel → Fixed 303 relays
│   ├── POST /api/webhook        → Quarantined until Day 9
│   └── GET /api/health          → Health check
│
├── 🧠 Services (6 integrations)
│   ├── Supabase (PostgreSQL + Auth)
│   ├── Sharp (Transient image normalization)
│   ├── AILabTools (Skin analysis)
│   ├── OpenAI (Routine generation)
│   ├── Upstash Redis (Rate limiting)
│   └── Dodo Payments (Subscriptions)
│
├── 🔐 Security
│   ├── JWT authentication
│   ├── Row-level security (RLS)
│   ├── Rate limiting (10 req/min)
│   ├── CORS protection
│   └── Input validation (Zod)
│
└── 📊 Database
    ├── skin_analysis table (owner-readable scan results)
    ├── subscriptions table (service-role-only entitlements)
    ├── billing_checkout_attempts table (private idempotency state)
    ├── payment_webhook_events table (signed lifecycle event ledger)
    └── scan_quota_reservations table (atomic monthly scan allowance)
```

---

## 🧪 Test an Endpoint

### Get a JWT Token

First, authenticate with Supabase to get a JWT token:

```javascript
// Use Supabase Auth UI or API
const { data, error } = await supabase.auth.signInWithPassword({
  email: "user@example.com",
  password: "password",
});
const token = data.session.access_token;
```

### Test Scan Endpoint

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Authorization: Bearer ${TEJAI_ACCESS_TOKEN}" \
  -F "image=@path/to/image.jpg"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "glowScore": 78,
    "skinType": "oily",
    "concerns": ["Mild Acne"],
    "routine": {...},
    "trend": "↑"
  }
}
```

---

## 📚 Documentation

| File                             | Purpose                       |
| -------------------------------- | ----------------------------- |
| [README.md](./README.md)         | API reference & overview      |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Full setup guide (400+ lines) |
| [.env.example](./.env.example)   | Config template with comments |
| [db/SCHEMA_SETUP.md](./db/SCHEMA_SETUP.md) | Ordered migration and RLS setup |

---

## 🔧 Development Commands

```bash
npm run dev       # Start with auto-reload (nodemon)
npm start         # Production mode
npm run lint      # Check code quality
npm run format    # Auto-format code
```

---

## 🐛 Troubleshooting

**"Port 3001 already in use"**

```bash
# Find what's using port 3001
lsof -i :3001           # macOS/Linux
netstat -ano | findstr :3001  # Windows

# Kill the process
kill -9 <PID>           # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

**"Cannot find module 'xyz'"**

```bash
rm -rf node_modules package-lock.json
npm install
```

**"Unauthorized" errors**

- Verify JWT token is valid
- Check `SUPABASE_SERVICE_ROLE_KEY` in .env
- Ensure `Authorization: Bearer <token>` header is set

**"Database connection failed"**

- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Check Supabase project is running (dashboard)
- Verify schema was imported (check tables in Supabase)

---

## 🎯 Next: Frontend Integration

Once backend is running, connect frontend:

1. Create API client in `frontend/src/lib/api.js`
2. Wire components to endpoints:
   - ScanUploader → `POST /api/scan`
   - Dashboard → `GET /api/history`
   - Paywall → `POST /api/billing/checkout` with a UUID
     `Idempotency-Key` header and strict `{ "plan": "starter" }` body
   - Settings → `GET /api/billing/subscription`

Keep `BILLING_CHECKOUT_ENABLED=false` until the billing migration, Dodo
test-mode products, and staging checks pass. Browser return/cancel parameters are
never payment proof; `/api/webhook` remains fail-closed until Day 9 Standard
Webhooks are implemented.

See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for detailed integration steps.

---

## 📞 Quick Links

- **Supabase Dashboard**: https://app.supabase.com
- **OpenAI Platform**: https://platform.openai.com
- **Upstash Console**: https://console.upstash.com
- **Express Docs**: https://expressjs.com
- **Zod Docs**: https://zod.dev

---

**🎉 You're ready to go! Start with:** `npm run dev`

Happy coding! 🚀
