# Production Dockerfile for texvic.ai (Instagram AI Growth Engine)
FROM node:22-bookworm-slim

# Install system dependencies: FFmpeg, Python, Chromium libraries, and ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    python3 \
    python3-pip \
    python-is-python3 \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    xdg-utils \
    && pip install --no-cache-dir --break-system-packages edge-tts \
    && rm -rf /var/lib/apt/lists/*

# Install cloudflared for automatic HTTPS web tunnel supervisor
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then CF_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then CF_ARCH="arm64"; \
    else CF_ARCH="amd64"; fi && \
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb -o cloudflared.deb && \
    dpkg -i cloudflared.deb && \
    rm cloudflared.deb

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Install Playwright Chromium browser accessible by all users
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN mkdir -p /ms-playwright /home/node/.cache && \
    npx playwright install --with-deps chromium && \
    chmod -R 777 /ms-playwright && \
    cp -a /ms-playwright /home/node/.cache/ && \
    chown -R node:node /home/node/.cache

# Copy application source
COPY . .

# Build Vite frontend & Node server bundle
RUN npm run build

# Create persistent storage directories
RUN mkdir -p data/browser_profile data/recordings data/screenshots && \
    chown -R node:node /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0

EXPOSE 3100

# Persistent volumes should be mounted to /app/data
VOLUME ["/app/data"]

# Run as non-root user
USER node

CMD ["npm", "start"]
