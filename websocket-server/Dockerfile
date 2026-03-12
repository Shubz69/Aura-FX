# Node 20 - no Nixpacks (avoids NIXPACKS_PATH / Node 18 EOL)
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "index.js"]
