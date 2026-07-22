# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.0.6 --activate
WORKDIR /app

FROM base AS deps
ENV HUSKY=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
RUN pnpm install --filter server... --frozen-lockfile

FROM base AS builder
ENV HUSKY=0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/server ./apps/server
WORKDIR /app/apps/server
RUN pnpm exec prisma generate && pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HUSKY=0

# Prisma engines + CLI need the workspace install layout from the builder.
COPY --from=builder /app /app
WORKDIR /app/apps/server

COPY apps/server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
