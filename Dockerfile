# Use Node.js 20 slim image as base
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for tsx)
RUN npm ci

# Copy source code
COPY scripts/ ./scripts/
COPY newsletter-search/src/lib/ ./newsletter-search/src/lib/
COPY config/ ./config/
COPY . .

# Set entrypoint to run the processing script with tsx
ENTRYPOINT ["npx", "tsx", "scripts/process-newsletters.ts"]

# Default command (empty - entrypoint handles it)
CMD []
