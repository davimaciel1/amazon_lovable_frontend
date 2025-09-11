@echo off
title System Restart - N8N Amazon Project
color 0A

echo ========================================
echo    N8N AMAZON SYSTEM RESTART
echo ========================================
echo.

:: Kill existing processes
echo [1/4] Stopping existing processes...
echo.

:: Kill Node.js processes (backend and frontend)
echo Stopping Node.js processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel%==0 (
    echo - Node.js processes stopped
) else (
    echo - No Node.js processes were running
)

:: Kill npm processes
echo Stopping npm processes...
taskkill /F /IM npm.exe 2>nul
if %errorlevel%==0 (
    echo - npm processes stopped
) else (
    echo - No npm processes were running
)

:: Wait for processes to fully terminate
echo.
echo [2/4] Waiting for processes to terminate...
timeout /t 3 /nobreak >nul

:: Clear temporary files
echo.
echo [3/4] Clearing temporary files...
if exist "amazon-unified-backend\nul" del "amazon-unified-backend\nul" 2>nul
if exist "nul" del "nul" 2>nul
if exist "sync-items-progress.json" del "sync-items-progress.json" 2>nul
echo - Temporary files cleared

:: Start the system
echo.
echo [4/4] Starting the system...
echo.

:: Start backend
echo Starting backend server...
start "Amazon Backend" /D "amazon-unified-backend" cmd /c "npm run dev"

:: Wait a moment for backend to initialize
timeout /t 5 /nobreak >nul

:: Start frontend
echo Starting frontend application...
start "Lovable Frontend" /D "lovable-frontend" cmd /c "npm run dev"

:: Wait and then open browser
echo.
echo ========================================
echo    SYSTEM RESTART COMPLETE!
echo ========================================
echo.
echo Backend running on: http://localhost:8080
echo Frontend running on: http://localhost:8087
echo.
echo Waiting 5 seconds before opening browser...
timeout /t 5 /nobreak

:: Open frontend in browser
start http://localhost:8087

echo.
echo System is now running. Press any key to exit this window...
pause >nul