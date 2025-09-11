@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Start backend
start "Amazon Backend" cmd /c "cd /d "%~dp0amazon-unified-backend" && npm run dev"

REM Give the backend a few seconds to boot
timeout /t 3 /nobreak >nul

REM Start frontend (Vite)
start "Lovable Frontend" cmd /c "cd /d "%~dp0lovable-frontend" && npm run dev"

REM Wait then open sales page
timeout /t 5 /nobreak >nul
start "" "http://localhost:8092/sales?preset=12months&sortBy=revenue&sortDir=desc"

exit /b 0

