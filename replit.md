# Overview

This is an Amazon Seller SaaS platform that provides comprehensive business intelligence and analytics for Amazon sellers. The system integrates with Amazon's SP-API and Advertising API to deliver real-time sales data, inventory management, product analytics, and advertising metrics through a unified dashboard interface.

The platform consists of multiple interconnected components including a main backend API server, an AI query interface, a code quality orchestration system (CEREBRO), and various frontend interfaces, all centered around a PostgreSQL database containing synchronized Amazon data.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Component Backend Architecture

The system employs a multi-service architecture with specialized components:

**Main Backend (amazon-unified-backend)**: Express.js server on port 8080 handling core business logic, SP-API integration, and REST API endpoints for sales data, product management, and inventory tracking.

**AI Query Server**: Standalone service on port 8086 providing natural language SQL query interface for data analysis, built with Express.js and OpenAI integration.

**CEREBRO**: Next.js 14 application on port 3001 serving as an internal code quality orchestration system with its own database tables (brain_*) for monitoring and analysis.

## Database Design

**Primary Database**: PostgreSQL hosted at 49.12.191.119:5456 (amazon_monitor database) with comprehensive schema including:
- Products table with ASIN-based indexing, image management, and inventory tracking
- Orders and OrderItems tables for sales transaction data
- Specialized tables for CEREBRO's brain_* operations
- Image proxy system with Base64-encoded ASINs and caching mechanisms

**Data Relationships**: Foreign key relationships between products (ASIN), orders (amazon_order_id), and order_items for transactional integrity and efficient querying.

## Authentication & Security

**Clerk Integration**: Modern authentication system handling user management, session control, and secure access across all components.

**API Security**: JWT-based authentication for API endpoints with middleware validation and CORS configuration for cross-origin requests.

## Image Management System

**Proxy Architecture**: Custom image proxy system using Base64-encoded ASINs to serve product images without exposing direct Amazon URLs, implementing cache-control headers and ETag support for performance optimization.

**SP-API Catalog Integration**: Service layer for fetching real product images from Amazon's Catalog API with batch processing and rate limiting compliance.

## Data Synchronization

**Real-time Sync**: Automated synchronization services for SP-API data including orders, products, and inventory with configurable scheduling and error handling.

**Advertising API Integration**: Separate integration for Amazon Ads API providing campaign performance metrics, ACOS/ROAS calculations, and advertising spend tracking.

## Frontend Architecture

**React-based Dashboard**: Modern frontend built with React and Vite, featuring responsive design and real-time data visualization components.

**CopilotKit Integration**: AI assistant functionality embedded in the frontend for intelligent data analysis and user interactions.

## Performance Optimizations

**Caching Strategy**: Multi-layer caching including in-memory cache for image proxy (7-day TTL), database query optimization with proper indexing, and ETag-based HTTP caching.

**Rate Limiting**: Compliance with Amazon API rate limits through request queuing, retry mechanisms, and configurable delay systems.

# External Dependencies

## Amazon APIs
- **SP-API**: Core integration for orders, products, inventory, and catalog data with LWA authentication
- **Amazon Advertising API**: Campaign performance, advertising metrics, and spend tracking with OAuth 2.0 flow

## Authentication Services
- **Clerk**: User authentication, session management, and access control across all application components

## AI & ML Services
- **OpenAI API**: Powers CopilotKit assistant and CEREBRO's AI analysis features for natural language processing and data insights

## Database & Infrastructure
- **PostgreSQL**: Primary database for all application data with specialized configurations for high-performance querying
- **Node.js Runtime**: Backend services built on Node.js with Express.js framework for API development

## Additional Integrations
- **WebSocket Support**: Real-time updates for dashboard metrics and live data synchronization
- **Streamlit**: Python-based analytics interface for advanced data visualization and reporting (app.py)

# Replit Environment Setup

## Recent Changes (September 2025)

Successfully configured the Amazon Seller Dashboard system for optimal performance in the Replit cloud environment with the following key implementations:

## Development Configuration

**Demo Mode Implementation**: Backend configured with fallback demo mode when Amazon API credentials are unavailable, ensuring full functionality for development and testing without external dependencies.

**Environment Safety**: Configured with `DISABLE_SCHEDULES=true` and `ENABLE_AUTO_SYNC=false` to prevent unintended side effects in development environment.

## Frontend Optimization for Replit

**Vite Host Configuration**: Fixed critical allowedHosts configuration for Replit proxy compatibility:
```typescript
allowedHosts: ["localhost", "127.0.0.1", ".replit.dev", ".replit.app"]
```

**HMR Configuration**: Optimized Hot Module Replacement for secure WebSocket connections through Replit proxy:
```typescript
hmr: {
  protocol: 'wss',
  clientPort: 443,
  overlay: true,
}
```

## Workflow Configuration

**Backend Workflow**: Express.js server on localhost:8080 for internal API communication
**Frontend Workflow**: Vite development server on 0.0.0.0:5000 for external access through Replit proxy

## Database Integration

**PostgreSQL Setup**: Successfully connected to Replit's integrated PostgreSQL database with proper environment variable configuration for seamless development.

## Deployment Configuration

**Production Ready**: Configured autoscale deployment target with:
- Build process for both frontend (Vite) and backend compilation
- Production run configuration using Vite preview for frontend and Express for backend
- Optimized for stateless website deployment with database state management

## Development Status

✅ **Fully Operational**: Both frontend and backend running successfully with full communication  
✅ **Hot Reload**: Vite HMR connected and functioning  
✅ **Database**: PostgreSQL connected and accessible  
✅ **Deployment**: Production deployment configuration completed  
✅ **Proxy Compatibility**: All host configuration issues resolved for Replit environment