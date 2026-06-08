#!/bin/bash
# Quick Setup Script for TejAi Backend
# Run from backend/ directory: bash SETUP.sh

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════╗"
echo "║      TejAi Backend Setup Script                      ║"
echo "╚═══════════════════════════════════════════════════════╝"

# Step 1: Check Node.js
echo ""
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js: $NODE_VERSION"

# Step 2: Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Step 3: Create .env from template
echo ""
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    echo "⚠️  Edit .env with your service credentials:"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY"
    echo "   - CLOUDINARY_CLOUD_NAME"
    echo "   - OPENAI_API_KEY"
    echo "   - UPSTASH_REDIS_REST_URL"
    echo "   - DODO_API_KEY"
else
    echo "✅ .env already exists"
fi

# Step 4: Create logs directory
echo ""
echo "📂 Creating logs directory..."
mkdir -p logs

# Step 5: Display next steps
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║           Setup Complete! Next Steps:                ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "1. Edit .env with your service credentials:"
echo "   nano .env"
echo ""
echo "2. Verify credentials in Supabase, Cloudinary, etc."
echo ""
echo "3. Import database schema:"
echo "   - Go to Supabase SQL Editor"
echo "   - Paste contents of db/schema.sql"
echo "   - Click Run"
echo ""
echo "4. Start development server:"
echo "   npm run dev"
echo ""
echo "5. Test health endpoint:"
echo "   curl http://localhost:3001/api/health"
echo ""
echo "For detailed setup guide, see: DEPLOYMENT.md"
echo ""
