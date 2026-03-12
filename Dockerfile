# Use Node 20 LTS (Debian) - native deps (bcrypt, mysql2) build without extra tools
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps (include devDependencies for build); fallback to npm install if no lockfile
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build React app (increase memory for build)
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
COPY . .
RUN npm run build

# Production image
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Production deps only; fallback if no lockfile
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy built app and server (from builder so context is not required)
COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
