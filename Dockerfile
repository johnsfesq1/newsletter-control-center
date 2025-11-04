# Dockerfile for Newsletter Discovery Cloud Run Job
# Use Node.js 20 slim image as base
FROM node:20-slim

# Install Puppeteer dependencies (needed for web scraping)
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for tsx)
RUN npm ci

# Copy source code
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY . .

# Set entrypoint to run the discovery orchestrator with tsx
ENTRYPOINT ["npx", "tsx", "scripts/discovery/discover-orchestrator.ts"]

# Default command (empty - entrypoint handles it)
CMD []

