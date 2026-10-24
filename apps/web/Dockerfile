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
COPY apps/web apps/web
RUN pnpm --filter @desk/shared build && pnpm --filter @desk/web build

FROM node:22.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3100
WORKDIR /app
RUN corepack enable
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/app ./apps/web/app
COPY --from=build /app/apps/web/components ./apps/web/components
COPY --from=build /app/apps/web/lib ./apps/web/lib
WORKDIR /app/apps/web
EXPOSE 3100
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3100"]
