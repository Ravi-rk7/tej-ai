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
- [Cloudinary](https://cloudinary.com) → Dashboard → API keys
- [OpenAI](https://platform.openai.com) → API keys → Create key
- [Upstash](https://console.upstash.com) → Create Redis → Copy REST URL/Token
- [AILabTools](https://ailab.example.com) → API key
- [Dodo Payments](https://dodo.com) → API keys

### 3️⃣ Import Database Schema

- Go to [Supabase Dashboard](https://app.supabase.com)
- Select your project → SQL Editor
- Create new query
- Copy-paste contents of `backend/db/schema.sql`
- Click Run ▶️

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
{ "success": true, "message": "API is healthy" }
```

---

## 📦 What You Just Built

```
backend/
├── 📡 API Endpoints
│   ├── POST /api/scan           → Analyze skin image
│   ├── GET /api/history         → Fetch scan history
│   ├── POST /api/create-subscription → Payment session
│   ├── POST /api/webhook        → Payment webhook
│   └── GET /api/health          → Health check
│
├── 🧠 Services (6 integrations)
│   ├── Supabase (PostgreSQL + Auth)
│   ├── Cloudinary (Image hosting)
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
    ├── skin_analysis table (scan results)
    └── subscriptions table (user plans)
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
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "image=@path/to/image.jpg"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "imageUrl": "https://res.cloudinary.com/...",
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
| [db/schema.sql](./db/schema.sql) | Database schema               |

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
   - Paywall → `POST /api/create-subscription`

See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for detailed integration steps.

---

## 📞 Quick Links

- **Supabase Dashboard**: https://app.supabase.com
- **Cloudinary Dashboard**: https://cloudinary.com/console
- **OpenAI Platform**: https://platform.openai.com
- **Upstash Console**: https://console.upstash.com
- **Express Docs**: https://expressjs.com
- **Zod Docs**: https://zod.dev

---

**🎉 You're ready to go! Start with:** `npm run dev`

Happy coding! 🚀
