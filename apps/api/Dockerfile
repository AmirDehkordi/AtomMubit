FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY benchmarks benchmarks
RUN pnpm --filter @desk/shared build && pnpm --filter @desk/api build

FROM node:22.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/* && mkdir -p /app/apps/api/data/documents
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/benchmarks ./apps/api/benchmarks
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
