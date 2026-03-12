# Use Node 20 LTS - bypasses Nixpacks Node 18 EOL issue on Railway
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps (include devDependencies for build)
COPY package.json package-lock.json* ./
RUN npm ci

# Build React app (increase memory for build)
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built app and server
COPY --from=builder /app/build ./build
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
