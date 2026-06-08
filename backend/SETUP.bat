@echo off
REM Quick Setup Script for TejAi Backend (Windows)
REM Run from backend\ directory: SETUP.bat

cls
echo.
echo =====================================================
echo     TejAi Backend Setup Script ^(Windows^)
echo =====================================================
echo.

REM Step 1: Check Node.js
echo [1/5] Checking prerequisites...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo OK: Node.js %NODE_VERSION%

REM Step 2: Install dependencies
echo.
echo [2/5] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)

REM Step 3: Create .env from template
echo.
if not exist .env (
    echo [3/5] Creating .env from template...
    copy .env.example .env
    echo.
    echo WARNING: Edit .env with your service credentials:
    echo   - SUPABASE_URL
    echo   - SUPABASE_SERVICE_ROLE_KEY
    echo   - CLOUDINARY_CLOUD_NAME
    echo   - OPENAI_API_KEY
    echo   - UPSTASH_REDIS_REST_URL
    echo   - DODO_API_KEY
) else (
    echo [3/5] .env already exists
)

REM Step 4: Create logs directory
echo.
echo [4/5] Creating logs directory...
if not exist logs mkdir logs

REM Step 5: Display next steps
echo.
echo [5/5] Setup Complete!
echo.
echo =====================================================
echo              Next Steps:
echo =====================================================
echo.
echo 1. Edit .env with your service credentials:
echo    notepad .env
echo.
echo 2. Verify credentials in Supabase, Cloudinary, etc.
echo.
echo 3. Import database schema:
echo    - Go to Supabase SQL Editor
echo    - Paste contents of db\schema.sql
echo    - Click Run
echo.
echo 4. Start development server:
echo    npm run dev
echo.
echo 5. Test health endpoint:
echo    curl http://localhost:3001/api/health
echo.
echo For detailed setup guide, see: DEPLOYMENT.md
echo.
pause
