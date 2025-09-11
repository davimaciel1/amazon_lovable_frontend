@echo off
echo ====================================
echo Starting Amazon Seller System
echo ====================================
echo.

REM Start backend in new window
echo Starting Backend API on port 8080...
start "Backend API" cmd /k "cd amazon-unified-backend && npm run dev"

REM Wait a bit for backend to start
timeout /t 5 /nobreak > nul

REM Start frontend in new window
echo Starting Frontend on port 8087...
start "Frontend" cmd /k "cd lovable-frontend && npm run dev"

echo.
echo ====================================
echo System Starting...
echo ====================================
echo.
echo Backend API: http://localhost:8080
echo Frontend: http://localhost:8087
echo.
echo Wait for both services to start, then:
echo - Open http://localhost:8087 in your browser
echo - Login with test@example.com / test123456
echo.
echo To run tests: npm run test:e2e
echo.
pause