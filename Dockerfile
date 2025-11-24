# ---------- Builder ----------
FROM node:20-slim AS builder

WORKDIR /app

# Only package files first for better caching
COPY package*.json ./
RUN npm ci

# Bring in the rest of the source
COPY . .

# Compile TypeScript
RUN npm run build

# ---------- Runner ----------
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS only
COPY --from=builder /app/dist ./dist

# Default command is harmless (we override in Cloud Run Jobs)
CMD ["node", "-e", "console.log('ncc-worker image ready')"]
