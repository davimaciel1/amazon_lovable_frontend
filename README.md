# Amazon Unified Monitoring System

A comprehensive Amazon seller dashboard that integrates SP-API and Advertising API to provide real-time business metrics and analytics.

## 🚀 Features

- **Real-time Dashboard**: View sales, revenue, orders, and product performance metrics
- **Amazon SP-API Integration**: Sync orders, products, and inventory data
- **Amazon Advertising API**: Track campaign performance, ACOS, and advertising metrics
- **PostgreSQL Database**: Centralized data storage for all Amazon data
- **JWT <AMAZON_SELLER_ID>**: Secure user <AMAZON_SELLER_ID> and session management
- **WebSocket Support**: Real-time updates for dashboard metrics

## 📋 Prerequisites

- Node.js v18+ and npm
- PostgreSQL database
- Amazon Seller Account with API access
- Amazon Advertising Account with API access

## 🔐 <AMAZON_SELLER_ID>

### <AMAZON_SELLER_ID>
Use Clerk (no static test credentials). Configure keys in environment variables.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)               │
│                     http://localhost:8087                │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                Backend (Node.js + Express)               │
│                     http://localhost:8080                │
│                   WebSocket: port 8080                   │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL Database                       │
│                   <DB_HOST>:5432                         │
└──────────────────────────────────────────────────────────┘
```

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd N8N_Amazon
```

### 2. Install Backend Dependencies
```bash
cd amazon-unified-backend
npm install
```

### 3. Install Frontend Dependencies
```bash
cd ../lovable-frontend
npm install
```

### 4. Environment Configuration

#### Backend (.env)
Create `amazon-unified-backend/.env` with:
```env
# Server Configuration
NODE_ENV=development
PORT=8080

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=app
DB_USER=app
DB_PASSWORD=

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production-2024
JWT_REFRESH_SECRET=your-refresh-token-secret-change-in-production-2024
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Amazon SP-API Configuration
SP_API_CLIENT_ID=<your-client-id>
SP_API_CLIENT_SECRET=<your-client-secret>
SP_API_REFRESH_TOKEN=<your-refresh-token>
AMAZON_SELLER_ID=<your-seller-id>
SP_API_REGION=na
MARKETPLACE_ID_US=ATVPDKIKX0DER

# Amazon Advertising API Configuration
ADS_API_CLIENT_ID=<your-ads-client-id>
ADS_API_CLIENT_SECRET=<your-ads-client-secret>
ADS_API_REFRESH_TOKEN=<your-ads-refresh-token>
ADS_PROFILE_ID_US=<your-profile-id>

# Sync toggles (optional)
ENABLE_AUTO_SYNC=false
ENABLE_ADS_SYNC=false
```

#### Frontend (.env)
Create `lovable-frontend/.env` with:
```env
VITE_API_URL=http://localhost:8080
```

#### Backend (advanced .env)
Optional tuning and integrity settings:
```env
# Disable all scheduled jobs (default: false)
DISABLE_SCHEDULES=false

# Image validation & fixing
IMAGE_SYNC_RUN_ON_START=true
IMAGE_SYNC_CRON="30 2 * * *"   # 02:30 daily

# Inventory sync
INVENTORY_SYNC_CRON="0 3 * * *" # 03:00 daily

# Price/Revenue repair
PRICE_REPAIR_CRON="30 3 * * *"  # 03:30 daily
PRICE_REPAIR_WINDOW_DAYS=30      # Days window to repair recent data
INTEGRITY_WINDOW_DAYS=90         # Days window for integrity metrics

# Avoid mock/simulated product data by default
ENABLE_SIMULATED_PRODUCT_DATA=false
# Lock to prevent any simulation regardless of ENABLE_SIMULATED_PRODUCT_DATA
CONSISTENCY_LOCK=true
```

## 🚀 Running the Application

### Start Backend Server
```bash
cd amazon-unified-backend
npm run dev
```

### Start Frontend Development Server
```bash
cd lovable-frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:8087
- Backend API: http://localhost:8080
- WebSocket: ws://localhost:8080

## 📊 Database Schema

### Main Tables
- **users**: User <AMAZON_SELLER_ID> and profiles
- **orders**: Amazon order data
- **order_items**: Individual items in orders
- **products**: Product catalog
- **advertising_campaigns**: Advertising campaign data
- **advertising_metrics**: Campaign performance metrics
- **api_tokens**: API refresh token storage

## 🔌 API Endpoints

### <AMAZON_SELLER_ID>
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Dashboard
- `GET /api/dashboard` - Get dashboard overview
- `GET /api/dashboard/stats` - Get dashboard statistics

### Sales
- `GET /api/sales` - Get sales data with pagination
- `GET /api/sales/growth` - Get sales growth metrics

### Products
- `GET /api/products` - Get product list
- `GET /api/products/:asin` - Get specific product
- `GET /api/products/top` - Get top performing products

### Orders
- `GET /api/orders` - Get order list
- `GET /api/orders/:orderId` - Get specific order
- `GET /api/orders/summary` - Get order summary

### Monitoring & Integrity
- `GET /api/system/data-integrity` — Data integrity dashboard (counts of issues like ASINs com qty>0 e revenue=0, imagens faltantes, etc.).
  - Query window is controlled by `INTEGRITY_WINDOW_DAYS` (default 90).
- `GET /api/system/images/status` — Resumo do estado de imagens (quantidade com image_url/local_image_url, placeholders, amostras recentes).

### Images
- `GET /app/product-images/:id.:format` — Proxy de imagem com cache/ETag e placeholders reais (png/jpeg/webp). `:id` aceita ASIN ou Base64(ASIN).

## 🧪 Testing

### Unit tests (Jest)
```bash
cd amazon-unified-backend
npm test
```
- Inclui testes para:
  - Cálculo de revenue em `/api/sales-simple` com fallbacks (products.price, Product."currentPrice", distribuição do total do pedido).
  - Reparos de integridade que retornam a métrica de zero-revenue ao baseline.
  - Atualização de estoque via `inventorySyncService` (mock do SP-API com axios).

### Run API Tests (manual)
```bash
cd amazon-unified-backend
node test-real-data-api.js
```

### Check Database Structure
```bash
cd amazon-unified-backend
node check-table-structure.js
```

## 📦 Project Structure

```
N8N_Amazon/
├── amazon-unified-backend/     # Backend Node.js application
│   ├── src/
│   │   ├── config/            # Configuration files
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic services
│   │   └── utils/            # Utility functions
│   ├── .env                  # Environment variables
│   └── package.json
│
├── lovable-frontend/          # Frontend React application
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   └── hooks/           # Custom React hooks
│   ├── .env                 # Environment variables
│   └── package.json
│
└── README.md                 # This file
```

## 🔧 Development Tools

### Manual Maintenance Scripts
```bash
# Backfill de preços/receitas (últimos 90 dias por default / BACKFILL_DAYS)
cd amazon-unified-backend
node scripts/backfill-order-prices.js

# Encontrar ASINs com revenue=0 na janela (INTEGRITY_WINDOW_DAYS) e amostrar itens
node scripts/find-zero-revenue-asins.js
```

### Available Scripts

#### Backend
- `npm run dev` - Start development server with nodemon
- `npm run build` - Compile TypeScript
- `npm start` - Start production server

#### Frontend
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🐛 Troubleshooting

### Common Issues

#### JWT Token Expired
If you see "jwt expired" errors, log in again to get a new token.

#### Database Connection Issues
Ensure the database credentials in `.env` are correct and the PostgreSQL server is running.

#### API Sync Issues
Check that your Amazon API credentials are valid and have the necessary permissions.

## 🔒 Security Notes

- **Never commit** `.env` files to version control
- **Change default JWT secrets** in production
- **Use HTTPS** in production environments
- **Implement rate limiting** for API endpoints
- **Regularly update** dependencies for security patches

## 📝 Data Synchronization

The system includes services for automatic data synchronization (agendados por cron):

### Image Validation & Fix
- Valida e substitui placeholders por imagens reais (quando possível), salvando localmente.
- Default: 02:30 todos os dias (`IMAGE_SYNC_CRON`, pode ajustar).

### Inventory Sync (FBA/Listings)
- Atualiza `products.inventory_quantity` e `in_stock` com dados reais (FBA summaries; fallback Listings).
- Default: 03:00 todos os dias (`INVENTORY_SYNC_CRON`).

### Price/Revenue Repair
- Preenche `order_items.price_amount` quando faltante (item_price/listing_price/products.price/Product."currentPrice"/distribuição do total do pedido) e recalcula `orders.order_total_amount` se 0/null.
- Default: 03:30 todos os dias (`PRICE_REPAIR_CRON`), janela recente controlada por `PRICE_REPAIR_WINDOW_DAYS` (default 30).

### Advertising API Sync Service (se habilitado)
- Syncs campaign data e atualiza métricas de anúncios.

## 🚦 API Rate Limits

Be aware of Amazon API rate limits:
- SP-API: Varies by endpoint (typically 1-30 requests/second)
- Advertising API: Varies by endpoint (typically 1-10 requests/second)

## 📈 Performance Optimization

- Database queries use indexes for optimal performance
- API responses are paginated to reduce load
- WebSocket connections for real-time updates
- Token refresh handled automatically

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary and confidential.

## 👥 Support

For support and questions, contact the development team.

---

**Last Updated**: August 28, 2025
**Version**: 1.0.0



