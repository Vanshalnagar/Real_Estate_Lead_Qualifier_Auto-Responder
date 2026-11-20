FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY backend backend
RUN npm run build -w backend

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace=backend --include-workspace-root && npm cache clean --force
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/scripts/start-production.mjs ./backend/scripts/start-production.mjs
USER node
EXPOSE 10000
CMD ["node", "backend/scripts/start-production.mjs"]
