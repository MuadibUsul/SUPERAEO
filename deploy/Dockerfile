# syntax=docker/dockerfile:1
#
# CIP production image.
# One image, two commands:
#   - web:    next start (default CMD)
#   - worker: npm run worker  (BullMQ; set via compose command override)
#
# Worker and migrations need `tsx` and the Prisma CLI at runtime; those tools
# are production dependencies. The runtime image intentionally omits lint,
# test, browser, and compiler-only packages.

# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma 7 reads DATABASE_URL from prisma.config.ts even for `generate`, and
# `next build` may touch modules that read it. Only the format matters here;
# runtime values come from compose env, never from the image.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

# The generated client (src/generated/prisma) is gitignored, so it must be
# produced inside the image before TypeScript/Next compile.
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime dependencies
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Non-root user. /app is chowned below so next start can write its cache dir.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=runtime-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./

USER nextjs

EXPOSE 3000

# No curl/wget in the slim image; probe the landing page with Node. Any
# non-5xx response (200, or a locale redirect) counts as alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/zh-CN').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
