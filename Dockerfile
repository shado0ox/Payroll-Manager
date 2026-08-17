# ====================================================================
# Multi-stage Dockerfile for Masar Payroll System (No Nginx)
# Uses Node.js direct high-performance serving (Zero Nginx dependencies)
# ====================================================================

# Stage 1: Build Frontend App
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json* ./

# Install packages
RUN npm install

# Copy source code and config
COPY . .

# Build production bundle into /app/dist
RUN npm run build

# ====================================================================
# Stage 2: Clean Production Node.js Server Runner (Without Nginx)
# ====================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install serve or run lightweight static server
RUN npm install -g serve

# Create non-root unprivileged secure user
RUN addgroup -g 1001 -S masargroup && \
    adduser -S masaruser -u 1001 -G masargroup

# Copy built application from builder stage
COPY --from=builder --chown=masaruser:masargroup /app/dist /app/dist

USER masaruser

EXPOSE 3000

# Container Healthcheck directly via Node / wget without Nginx
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1

# Start Single Page Application directly on port 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
