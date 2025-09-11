@echo off
set ENABLE_AUTO_SYNC=true
set SYNC_INTERVAL_MINUTES=15
cd /d "%~dp0"
node -e "require('ts-node/register/transpile-only'); require('./src/index.ts');"

