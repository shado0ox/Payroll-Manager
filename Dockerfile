# ====================================================================
# Multi-stage Dockerfile for Masar Payroll System (No Nginx)
# Uses Node.js direct high-performance serving (Zero Nginx dependencies)
# ====================================================================

# Stage 1: Build Frontend App
FROM node:20.19-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20.19-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm run build

FROM node:20.19-alpine AS runner
ENV NODE_ENV=production PORT=3033
WORKDIR /app
RUN addgroup -S -g 10001 masar && adduser -S -u 10001 -G masar masar
COPY --from=deps --chown=masar:masar /app/node_modules ./node_modules
COPY --from=builder --chown=masar:masar /app/dist ./dist
COPY --chown=masar:masar server ./server
COPY --chown=masar:masar package.json ./package.json
USER 10001:10001
EXPOSE 3033
CMD ["node", "server/index.mjs"]
