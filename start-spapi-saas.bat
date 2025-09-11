@echo off
echo ============================================================
echo Iniciando SP-API SaaS com suas credenciais Amazon Ads
echo ============================================================
echo.

cd spapi-saas

REM Copiar .env se não existir
if not exist api\.env (
    echo Criando arquivo .env...
    copy api\.env.example api\.env
)

if not exist web\.env.local (
    echo Criando arquivo .env.local para frontend...
    copy web\.env.example web\.env.local
)

echo.
echo Iniciando containers Docker...
docker-compose up -d --build

echo.
echo ============================================================
echo Sistema iniciando...
echo ============================================================
echo.
echo Aguarde alguns segundos e acesse:
echo.
echo FRONTEND (Dashboard): http://localhost:3000
echo API (Documentacao):   http://localhost:8000/docs
echo.
echo Suas credenciais Amazon Ads estao configuradas:
echo - Profile US: 33385789758976 (Cuttero Knives)
echo - Profile CA: 1963446470883707 (Connect Brands)
echo - Profile MX: 1491669981625342 (Connect Brands)
echo.
echo Para ver os logs:
echo   docker-compose logs -f
echo.
echo Para parar:
echo   docker-compose down
echo ============================================================
pause