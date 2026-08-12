# syntax=docker/dockerfile:1
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100
# Docker sets HOSTNAME to the container ID, which Next standalone would bind
# to exclusively — loopback (healthcheck) and bridge traffic both need 0.0.0.0.
ENV HOSTNAME=0.0.0.0
ENV OJOS_DATA_DIR=/data

RUN groupadd -r ojos && useradd -r -g ojos ojos \
  && mkdir -p /data && chown ojos:ojos /data

# Standalone output bundles the server and pruned node_modules.
COPY --from=build --chown=ojos:ojos /app/.next/standalone ./
COPY --from=build --chown=ojos:ojos /app/.next/static ./.next/static
COPY --from=build --chown=ojos:ojos /app/public ./public
COPY --from=build --chown=ojos:ojos /app/data ./data

USER ojos
EXPOSE 3100
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
