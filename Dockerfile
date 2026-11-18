# Production image for Cloud Run. Build: docker build -t commodity-aipro .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# tsx (runtime) is in "dependencies", so --omit=dev is enough.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY server ./server
COPY src ./src
COPY firebase-applet-config.json ./
# SQLite lives in /app/data (EPHEMERAL on Cloud Run, see docs/DEPLOY.md).
RUN mkdir -p /app/data && chown -R node:node /app
USER node
# Cloud Run injects PORT (default 8080); server.ts reads process.env.PORT.
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
