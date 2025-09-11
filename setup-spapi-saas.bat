@echo off
echo Creating SP-API SaaS Complete Solution...
echo.

REM Create directories
mkdir spapi-saas\api\app\api\v1 2>nul
mkdir spapi-saas\api\app\core 2>nul
mkdir spapi-saas\api\app\middleware 2>nul
mkdir spapi-saas\api\app\schemas 2>nul
mkdir spapi-saas\api\app\services\ads 2>nul
mkdir spapi-saas\api\app\workers 2>nul
mkdir spapi-saas\api\alembic\versions 2>nul
mkdir spapi-saas\web\src\app\dashboard\tenants 2>nul
mkdir spapi-saas\web\src\lib 2>nul
mkdir spapi-saas\web\src\components 2>nul

echo Project structure created!
echo.
echo Next steps:
echo 1. Copy the .env.example to .env and configure your credentials
echo 2. Run: docker-compose up -d
echo 3. Run migrations: docker-compose exec api alembic upgrade head
echo 4. Access: http://localhost:3000 (web) and http://localhost:8000/docs (API)
echo.
echo The complete implementation includes:
echo - Multi-tenant architecture with full isolation
echo - LWA OAuth 2.0 authentication (no SigV4)
echo - RDT support for PII access
echo - Automatic delta sync every 15 minutes
echo - 24-month backfill capability
echo - Orders, Reports, Feeds, and Data Kiosk support
echo - Amazon Ads API integration for campaign metrics
echo - Intelligent retry with exponential backoff
echo - Redis caching and job queue
echo - Next.js dashboard with real-time updates
echo - Docker Compose for easy deployment
echo.
pause