# Use Node 20 LTS (Debian) - native deps (bcrypt, mysql2) build without extra tools
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install deps (include devDependencies for build); fallback to npm install if no lockfile
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build React app only if package.json has a "build" script (main app); else skip (e.g. websocket-server)
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
COPY . .
RUN if grep -q '"build"' package.json; then npm run build; else mkdir -p build; fi
RUN [ -f server.js ] || touch server.js; [ -f index.js ] || touch index.js

# Production image
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Production deps only; fallback if no lockfile
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy built app and entry (main app: server.js + build/; websocket-server: index.js)
COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./
COPY --from=builder /app/index.js ./

ENV NODE_ENV=production
EXPOSE 8080

# Main app has server.js; websocket-server has index.js (server.js is placeholder)
CMD ["sh", "-c", "if [ -s server.js ]; then exec node server.js; else exec node index.js; fi"]
