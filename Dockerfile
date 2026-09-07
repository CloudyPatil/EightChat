FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN corepack enable && pnpm install --frozen-lockfile --filter server...
COPY server server
RUN pnpm --filter server build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/app.js"]
