# Overview

This project is an Amazon Seller SaaS platform providing business intelligence and analytics for Amazon and Mercado Livre sellers. It integrates with Amazon's SP-API and Advertising API to offer real-time sales, inventory, product, and advertising metrics through a unified dashboard. The platform includes a multi-component backend with an AI query interface, a code quality orchestration system (CEREBRO), and a React-based frontend, all utilizing a PostgreSQL database for synchronized Amazon data. The ambition is to provide comprehensive data insights to empower sellers.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Multi-Component Backend Architecture

The system uses a multi-service architecture:

-   **Main Backend (amazon-unified-backend)**: Express.js server on port 8080 handling core business logic, SP-API integration, and REST API endpoints for sales, product, and inventory data.
-   **AI Query Server**: Express.js service on port 8086 providing a natural language SQL query interface using OpenAI.
-   **CEREBRO**: Next.js 14 application on port 3001 for internal code quality orchestration, with dedicated database tables (`brain_*`).
-   **MCP Servers**:
    -   **MCP Server Principal (Port 8008)**: For Amazon and Mercado Livre sales data analysis, with `search` and `fetch` tools.
    -   **MCP Code Analysis Server (Port 6000)**: For secure source code analysis and bug detection, with `search_code` and `analyze_file` tools, whitelisting `src` folders and blocking sensitive files.

## Database Design

-   **Primary Database**: External PostgreSQL at `49.12.191.119:5456` (`amazon_monitor` database) for all application data.
    -   **CRITICAL RULE**: Only this external PostgreSQL database is to be used. **NEVER** create new databases, use Replit's internal PostgreSQL, or rely on `DATABASE_URL`. Always use individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` environment variables.
-   **Schema**: Includes tables for products (ASIN-based indexing), orders, order items, and CEREBRO-specific operations.
-   **Data Relationships**: Foreign key relationships for transactional integrity and efficient querying.

## Authentication & Security

-   **Clerk Integration**: Handles user management, session control, and secure access.
-   **API Security**: JWT-based authentication with middleware validation and CORS.
-   **OAuth Compatibility Shims**: Implemented for ChatGPT MCP integration, serving consistent OAuth metadata across various discovery paths to ensure compatibility.

## Image Management System

-   **Proxy Architecture**: Custom system using Base64-encoded ASINs to proxy product images from Amazon's Catalog API with caching (1-hour TTL) and rate limiting.

## Data Synchronization

-   **SP-API Data Sync**: Automated synchronization for orders, products, and inventory with configurable scheduling.
-   **Advertising API Integration**: Provides campaign performance, ACOS/ROAS, and advertising spend tracking.

## Frontend Architecture

-   **React-based Dashboard**: Built with React and Vite for responsive design and data visualization.
-   **CopilotKit Integration**: AI assistant functionality for intelligent data analysis.
-   **Detailed Orders System**: `OrdersModal` component displaying comprehensive Amazon and Mercado Livre order details, including customer information, accessed via `/api/orders-detailed`.

## Performance Optimizations

-   **Caching**: Multi-layer caching including in-memory for image proxy, database query optimization with indexing, and ETag-based HTTP caching.
-   **Rate Limiting**: Compliance with Amazon API rate limits through queuing and retry mechanisms.

## Development & Deployment Configuration

-   **Demo Mode**: Backend fallback for testing without Amazon API credentials.
-   **Replit Optimization**: Vite configuration (`allowedHosts`, `hmr` with `wss`) for compatibility with Replit proxy.
-   **Workflow**: Express.js on localhost:8080 (backend), Vite on 0.0.0.0:5000 (frontend).
-   **Deployment**: Autoscale deployment target with build processes for frontend and backend, optimized for stateless websites.

# External Dependencies

## Amazon APIs

-   **SP-API**: For orders, products, inventory, and catalog data (LWA authentication).
-   **Amazon Advertising API**: For campaign performance and advertising metrics (OAuth 2.0).

## Authentication Services

-   **Clerk**: User authentication, session management, and access control.

## AI & ML Services

-   **OpenAI API**: Powers CopilotKit and CEREBRO's AI analysis features.

## Database & Infrastructure

-   **PostgreSQL**: Primary database for all application data (hosted externally at `49.12.191.119:5456`).
-   **Node.js Runtime**: For backend services (Express.js).

## Additional Integrations

-   **WebSocket Support**: For real-time updates.
-   **Streamlit**: Python-based analytics interface (`app.py`).