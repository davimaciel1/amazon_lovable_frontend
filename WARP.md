# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is an Amazon Seller SaaS platform that integrates with Amazon's SP-API and Advertising API to provide sellers with sales analytics, inventory management, and business intelligence tools. The system includes both backend APIs and frontend dashboards, plus an internal code quality orchestration system called CEREBRO.

## Architecture

### Multi-Component System
- **Amazon Unified Backend**: Main API server handling SP-API integration, sales data, and business logic
- **Cerebro**: Internal code quality orchestration system (Next.js 14 app on port 3001)
- **AI Query Server**: Standalone PostgreSQL query interface for data analysis (port 8086)
- **Frontend**: React-based dashboard (served via different components)

### Database Architecture
- **Primary Database**: PostgreSQL hosted at 49.12.191.119:5456 (amazon_monitor database)
- **Tables**: Products, Orders, OrderItems, Sales data, plus CEREBRO's brain_* tables
- **User Management**: Clerk authentication integration
- **Data Sources**: Amazon SP-API, Amazon Ads API, internal scraping systems

### External API Integrations
- **Amazon SP-API**: Order management, inventory, product catalog, fulfillment data
- **Amazon Ads API**: Campaign performance, advertising metrics, ACOS/ROAS analysis
- **Clerk**: Authentication and user management
- **OpenAI**: Powers CopilotKit AI assistant and CEREBRO's AI features

## Common Development Commands

### Backend Development
```bash
# Start main backend server (port 8080)
cd amazon-unified-backend
node start-backend.js

# Alternative backend start with TypeScript compilation issues bypass
cd amazon-unified-backend
start-backend-8080.bat

# Start AI query server (port 8086)
node ai-query-server.js
```

### CEREBRO (Code Quality System)
```bash
# Navigate to CEREBRO
cd cerebro

# Install dependencies
npm install

# Database migration
npm run db:migrate

# Start CEREBRO development server (port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Update Claude context files
npm run brain:claude

# Setup database
npm run db:setup
```

### Database Operations
```bash
# Connect to main database
psql -h 49.12.191.119 -p 5456 -U saas -d amazon_monitor
# Password: saas_password_123

# Setup CEREBRO tables
psql -h 49.12.191.119 -p 5456 -U saas -d amazon_monitor -f cerebro/schema.sql
```

### Testing and Quality Checks
Based on CEREBRO's quality orchestration system:
```bash
# Type checking
npm run check:types

# Linting
npm run check:lint

# Dead code detection
npm run check:dead

# Architecture validation
npm run check:arch

# Run tests
npm run test

# E2E tests
npm run test:e2e

# Coverage analysis
npm run coverage

# Bundle analysis
npm run analyze:web
```

## Key Configuration Files

### Environment Setup
- **Root `.env`**: Global configuration for database, Clerk auth, Amazon APIs
- **CORS Origins**: Configured for multiple ports (8083, 8084, 8085, 8086)
- **API Keys**: SP-API credentials, Ads API credentials, Clerk keys, OpenAI key

### Important Environment Variables
```bash
# Database
DB_HOST=49.12.191.119
DB_PORT=5456
DB_NAME=amazon_monitor
DB_USER=saas

# Amazon APIs
SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN
ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, ADS_API_REFRESH_TOKEN
AMAZON_SELLER_ID, SP_API_REGION

# Authentication
CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY

# AI Integration
OPENAI_API_KEY
```

## Development Patterns and Conventions

### Database Patterns
- Uses PostgreSQL with both raw SQL queries and potential ORM integration
- Connection pooling via `pg` package
- Environment-based configuration through `scripts/common/db.js`
- CEREBRO uses UUID primary keys with `gen_random_uuid()`

### API Architecture
- Express.js with middleware: helmet, cors, compression, cookie-parser
- Clerk authentication integration with `@clerk/express`
- Health check endpoints (`/health`) on all services
- RESTful API design with error handling middleware

### Frontend Integration
- CopilotKit integration for AI-powered admin interface
- Multiple frontend serving strategies (static files, Next.js, React apps)
- Image proxy functionality to bypass CORS for Amazon product images

### Security Practices
- Credential rotation checklist in `docs/SECURITY_ROTATION_CHECKLIST.md`
- Environment variables for all secrets (never hardcoded)
- CORS configuration for specific origins
- Rate limiting on API endpoints
- WebSocket authentication via Clerk tokens

## CEREBRO Quality System

CEREBRO is an internal code quality orchestration system that provides:

### Features
- **Quality Gates**: Automated code quality enforcement
- **Dead Code Detection**: Find unused exports and dependencies  
- **Performance Budgets**: Bundle size monitoring (≤200KB gzip per page)
- **Test Runner**: Vitest unit/integration, Playwright E2E
- **Claude Context Management**: Auto-updates `.claude/` directory files
- **CopilotKit Integration**: AI-powered admin chat with 18+ automated actions

### CEREBRO Database Schema
Uses `brain_*` prefixed tables:
- `brain_runs`: Quality check execution history
- `brain_findings`: Issues and code smells detected
- `brain_budgets`: Performance and quality thresholds  
- `brain_competitors`: Competitor feature tracking
- `brain_issues`: Backlog with ICE scoring
- `brain_audit`: Audit log for admin actions

### CEREBRO Commands
```bash
# Run all quality checks
npm run brain:check

# Find dead code
npm run brain:dead  

# Check circular dependencies
npm run brain:cycles

# Update .claude context files
npm run brain:claude

# Run tests with coverage
npm run brain:test
```

## Special Considerations

### Port Management
- Main Backend: 8080 (or 8086 for AI query server)
- CEREBRO: 3001
- AI Query Server: 8086
- Frontend: Various (8083, 8084, 8085 depending on component)

### Database Access Patterns
- Read/write access to main `amazon_monitor` database
- CEREBRO has read-only access for introspection but read/write for its own brain_* tables
- Connection pooling and timeout management for stability

### Image Handling
- Amazon product images served via proxy to handle CORS
- Local product images served from `amazon-unified-backend/public/product-images`
- Cache headers and compression for performance

### AI Integration Architecture
- CopilotKit provides chat interface with context about sales data
- OpenAI integration for both user-facing AI and internal code analysis
- Context management through readable data hooks and custom actions

## Development Workflow

1. **Setup**: Copy `.env.example` to `.env` and configure all required API keys
2. **Database**: Ensure PostgreSQL connection is working and CEREBRO tables are created
3. **Backend**: Start main backend server on port 8080
4. **CEREBRO**: Optional - start quality monitoring system on port 3001  
5. **Frontend**: Start appropriate frontend component
6. **Quality**: Use CEREBRO's quality gates before committing code
7. **Security**: Run credential rotation checklist periodically

## Important Files and Directories

### Configuration
- `.env.example`: Template for all required environment variables
- `cerebro/schema.sql`: CEREBRO database schema
- `docs/SECURITY_ROTATION_CHECKLIST.md`: Security guidelines

### Core Backend Files
- `amazon-unified-backend/start-backend.js`: Main server entry point
- `ai-query-server.js`: Standalone database query service
- `cerebro/cerebro-server.js`: Quality orchestration system

### Documentation
- `COPILOTKIT_SETUP.md`: AI assistant integration guide
- `SPAPI-INTEGRATION-GUIDE.md`: Amazon API setup and credentials
- `.claude/CEREBRO.md`: Detailed PRD for the code quality system

### Quality and Maintenance
- `cerebro/`: Complete Next.js application for code quality management
- Scripts for data synchronization, image processing, and inventory management
- Automated quality gates with configurable thresholds

This architecture supports a sophisticated Amazon seller SaaS platform with built-in code quality management, AI assistance, and comprehensive business intelligence capabilities.
