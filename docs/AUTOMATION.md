# Automation Setup (Images and Backend)

This document describes how we automated product image updates and ensured the backend stays available, using Windows Task Scheduler.

Tasks created

1) AmazonImageUpdateDaily
- Schedule: daily at 03:00
- Command:
  cmd /c "cd /d "C:\Ippax Work\Projetos\N8N_Amazon\amazon-unified-backend" && node update-product-images-job.js --all"
- Purpose: Full sweep to refresh image_source_url and metadata for all products (bounded by internal rate limits).

2) AmazonImageUpdateHourly
- Schedule: hourly (every 1 hour) starting at 00:00
- Command:
  cmd /c "cd /d "C:\Ippax Work\Projetos\N8N_Amazon\amazon-unified-backend" && node update-product-images-job.js --limit 200"
- Purpose: Incremental updates during the day, keeping images fresh.

3) AmazonBackendStart
- Trigger: At user logon
- Command:
  cmd /c "cd /d "C:\Ippax Work\Projetos\N8N_Amazon\amazon-unified-backend" && npm run dev"
- Purpose: Ensure the backend starts automatically for serving images and APIs.

Notes
- All tasks change directory to the backend path before running, so .env (if present) and relative paths resolve correctly.
- The image jobs do not require SP-API credentials in .env to start; they load tokens from the database and use defaults for DB connection if env vars are missing.
- The backend dev process uses ts-node (transpile-only). For production, consider building and running dist/index.js as a service (e.g., with NSSM or PM2).

Managing tasks
- List tasks:
  schtasks /Query /FO LIST /V | findstr /I "AmazonImageUpdateDaily AmazonImageUpdateHourly AmazonBackendStart"
- Run a task now (example):
  schtasks /Run /TN "AmazonImageUpdateHourly"
- Change schedule (example, daily time):
  schtasks /Change /TN "AmazonImageUpdateDaily" /ST 02:30
- Delete a task:
  schtasks /Delete /TN "AmazonImageUpdateHourly" /F

Verification
- Backend health:
  curl http://localhost:8080/health
- Image check (ASIN B0CLBFSQH1):
  http://localhost:8080/app/product-images/QjBDTEJGU1FIMQ==.jpg

Optional
- If you prefer a single persistent scheduler process instead of Windows tasks, you can run:
  npm run scheduler:images
  and set IMAGE_UPDATE_CRON, IMAGE_UPDATE_BATCH_SIZE, RUN_ON_START in the environment.

