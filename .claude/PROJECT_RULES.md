# PROJECT RULES - AMAZON SP-API SAAS

## CRITICAL RULE #1: NO TEST PAGES
**NEVER create test HTML files or simplified React components**
- Use ONLY the existing Lovable frontend
- Modify ONLY what's necessary for integration
- NO test.html, NO AuthTest.tsx, NO AppSimple.tsx

## CRITICAL RULE #2: FOCUS ON INTEGRATION
**The goal is INTEGRATION, not CREATION**
- Frontend (Lovable) already EXISTS - use it
- Backend needs to CONNECT to frontend
- Database already EXISTS - just connect

## CRITICAL RULE #3: PRESERVE ORIGINAL UI
**Keep Lovable's original design and components**
- Don't recreate what already exists
- Don't make "simplified" versions
- Use the shadcn/ui components as they are

## PROJECT STRUCTURE
```
Frontend: Lovable (React + Vite) - EXISTS
Backend: Express API - CREATE ONLY WHAT'S NEEDED
Database: PostgreSQL on Coolify - EXISTS
```

## WHEN WORKING ON THIS PROJECT
1. ALWAYS use the existing Lovable frontend files
2. ONLY modify connection points (api.ts, auth hooks)
3. NEVER create alternative interfaces
4. FOCUS on making existing components work with backend

## RED FLAGS - STOP IF DOING THIS
- Creating .html files for testing
- Making "Test" components
- Building alternative UIs
- Creating "temporary" solutions
- Deviating from Lovable's structure

## SUCCESS CRITERIA
User opens Lovable frontend → Sees original UI → Connects to backend → Gets data from PostgreSQL