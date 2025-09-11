@echo off
echo ============================================================
echo Executando SP-API SaaS Localmente (sem Docker)
echo ============================================================
echo.

REM Verificar se Python esta instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Python nao encontrado. Instale Python 3.11+
    pause
    exit /b 1
)

REM Verificar se Node.js esta instalado  
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado. Instale Node.js 18+
    pause
    exit /b 1
)

echo Configurando Backend (FastAPI)...
echo.

cd spapi-saas\api

REM Criar ambiente virtual se nao existir
if not exist venv (
    echo Criando ambiente virtual Python...
    python -m venv venv
)

REM Ativar ambiente virtual
call venv\Scripts\activate.bat

REM Instalar dependencias
echo Instalando dependencias do backend...
pip install -q fastapi uvicorn sqlalchemy alembic psycopg2-binary redis httpx pydantic pydantic-settings python-jose passlib python-multipart cryptography

REM Criar .env se nao existir
if not exist .env (
    copy .env.example .env
)

echo.
echo Iniciando Backend API...
start cmd /k "cd /d %cd% && venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo.
echo Configurando Frontend (Next.js)...
cd ..\..\spapi-saas\web

REM Instalar dependencias se necessario
if not exist node_modules (
    echo Instalando dependencias do frontend...
    npm install
)

REM Criar .env.local se nao existir
if not exist .env.local (
    copy .env.example .env.local
)

echo.
echo Iniciando Frontend...
start cmd /k "cd /d %cd% && npm run dev"

echo.
echo ============================================================
echo Sistemas iniciados!
echo ============================================================
echo.
echo Acesse:
echo.
echo FRONTEND (Dashboard): http://localhost:3000
echo BACKEND (API Docs):   http://localhost:8000/docs
echo.
echo Suas credenciais Amazon Ads ja estao configuradas!
echo.
echo Para parar os servicos, feche as janelas do terminal.
echo ============================================================
cd ..\..
pause