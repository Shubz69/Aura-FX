# Node 20 — AWS Public ECR mirror of Docker Official Images (avoids Docker Hub IPv6/registry failures on Railway)
FROM public.ecr.aws/docker/library/node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "index.js"]
