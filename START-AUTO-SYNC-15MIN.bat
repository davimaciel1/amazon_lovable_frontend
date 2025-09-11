@echo off
echo ========================================================
echo    AMAZON SP-API AUTO SYNC - EVERY 15 MINUTES
echo ========================================================
echo.

REM Check if node is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js installed
echo.

REM Check if required modules are installed
echo Checking dependencies...
if not exist "node_modules\node-cron" (
    echo Installing node-cron...
    npm install node-cron
)
if not exist "node_modules\dotenv" (
    echo Installing dotenv...
    npm install dotenv
)
if not exist "node_modules\axios" (
    echo Installing axios...
    npm install axios
)
if not exist "node_modules\pg" (
    echo Installing pg...
    npm install pg
)

echo.
echo ========================================================
echo  IMPORTANT: Amazon SP-API Credentials Required
echo ========================================================
echo.
echo Please ensure you have configured your credentials in:
echo   AmazonSeller-mcp-server\.env
echo.
echo Required fields:
echo   - SP_API_CLIENT_ID
echo   - SP_API_CLIENT_SECRET
echo   - SP_API_REFRESH_TOKEN
echo.
echo If you don't have these, follow the Amazon SP-API 
echo documentation to create an app and get credentials.
echo.
echo ========================================================
echo.

REM Copy .env file to expected location if not exists
if not exist "amazon-sp-api-service\.env" (
    echo Creating .env file from AmazonSeller-mcp-server configuration...
    copy AmazonSeller-mcp-server\.env amazon-sp-api-service\.env >nul
    echo [✓] .env file created
) else (
    echo [✓] .env file exists
)

echo.
echo Starting sync scheduler...
echo ========================================================
echo.
echo The sync will run:
echo   - Immediately on startup
echo   - Every 15 minutes thereafter
echo   - Logs will be saved to sync_logs table
echo.
echo Press Ctrl+C to stop the scheduler
echo.
echo ========================================================
echo.

REM Start the scheduler
node sync-scheduler-15min.js

pause