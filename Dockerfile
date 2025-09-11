# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache \
    postgresql-client \
    curl \
    tzdata

# Set timezone
ENV TZ=America/Sao_Paulo

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY dashboard-server.js ./
COPY dashboard.html ./
COPY .env.example ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create necessary directories
RUN mkdir -p logs backup

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/sync-status || exit 1

# Expose port
EXPOSE 8080

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Start application
CMD ["node", "dashboard-server.js"]