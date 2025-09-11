@echo off
echo ====================================
echo Amazon Seller System E2E Test Suite
echo ====================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

REM Install required packages if not present
npm list puppeteer >nul 2>&1 || npm install puppeteer
npm list axios >nul 2>&1 || npm install axios
npm list pg >nul 2>&1 || npm install pg
npm list dotenv >nul 2>&1 || npm install dotenv

REM Create screenshots directory if not exists
if not exist "screenshots" mkdir screenshots

REM Set environment variables if not set
if "%API_URL%"=="" set API_URL=http://localhost:8080
if "%FRONTEND_URL%"=="" set FRONTEND_URL=http://localhost:3000
if "%DB_HOST%"=="" set DB_HOST=localhost
if "%DB_PORT%"=="" set DB_PORT=5432
if "%DB_NAME%"=="" set DB_NAME=amazon_seller_db
if "%DB_USER%"=="" set DB_USER=postgres
if "%DB_PASSWORD%"=="" set DB_PASSWORD=postgres

echo Configuration:
echo - Frontend: %FRONTEND_URL%
echo - API: %API_URL%
echo - Database: %DB_NAME%@%DB_HOST%:%DB_PORT%
echo.

REM Check if services are running
echo Checking services...
curl -s -o nul %API_URL%/health 2>nul
if errorlevel 1 (
    echo WARNING: API server may not be running at %API_URL%
    echo Please ensure the backend is running: cd amazon-unified-backend && npm run dev
    echo.
)

curl -s -o nul %FRONTEND_URL% 2>nul
if errorlevel 1 (
    echo WARNING: Frontend may not be running at %FRONTEND_URL%
    echo Please ensure the frontend is running: cd lovable-frontend && npm run dev
    echo.
)

echo Starting E2E tests...
echo.

REM Run the tests
node tests/e2e/test-complete-system.js

REM Check exit code
if errorlevel 1 (
    echo.
    echo ====================================
    echo Tests FAILED! Check logs above.
    echo Screenshots saved in ./screenshots/
    echo ====================================
    exit /b 1
) else (
    echo.
    echo ====================================
    echo All tests PASSED successfully!
    echo ====================================
    exit /b 0
)