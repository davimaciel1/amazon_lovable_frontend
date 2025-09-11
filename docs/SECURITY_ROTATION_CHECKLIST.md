# Security & Credential Rotation Checklist

This checklist helps ensure no sensitive data is committed and all credentials are rotated and stored securely.

## 1) Inventory current secrets
- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Clerk: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- SP‑API: `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`, `SP_API_REFRESH_TOKEN`, `AMAZON_SELLER_ID`, `SP_API_REGION`
- Ads API: `ADS_API_CLIENT_ID`, `ADS_API_CLIENT_SECRET`, `ADS_API_REFRESH_TOKEN`, `ADS_API_SECURITY_PROFILE_ID`, `ADS_PROFILE_ID_*`
- Optional JWT: `JWT_SECRET`, `JWT_REFRESH_SECRET`

## 2) Rotate credentials
- Generate new passwords/keys/tokens via their providers (DB, Clerk, Amazon SP‑API, Ads API)
- Update environment stores (local `.env`, server secrets manager, CI/CD variables)
- Never commit `.env` files; they are already ignored by `.gitignore`

## 3) Update application configuration
- Copy `.env.example` to `.env` and fill values
- Confirm backend starts: `cd amazon-unified-backend && npm run dev`
- Confirm frontend starts: `cd lovable-frontend && npm run dev`

## 4) Validate security
- WebSocket auth: enable with `ENABLE_WS_AUTH=true` (client sends Clerk token via `?token=`)
- CORS: configure `CORS_ORIGINS` to allowed origins
- Rate-limit: applied to `/api` (adjust via `RATE_LIMIT_*` envs)
- CSP: production mode avoids `'unsafe-inline'`

## 5) Scan repository for secrets
- Run: `node scripts/security/scan-secrets.js`
- If findings exist, sanitize and re-run until it reports “No sensitive patterns found.”

## 6) Optional cleanups
- Move historical/example files into a `docs/legacy/` folder and ensure `.gitignore` excludes any sensitive data dumps or backups
- Keep using `scripts/common/db.js` or env-based configuration; never hardcode DB/IP/passwords

