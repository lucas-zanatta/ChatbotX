FROM node:24-trixie-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install dependencies only when needed
FROM base AS pre
RUN npm install -g turbo@^2

# Generate a partial monorepo for a target package
WORKDIR /app
COPY . .
RUN turbo prune worker --docker

FROM base AS deps
ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /app
COPY --from=pre /app/out/json/ .
COPY --from=pre /app/.env .env
RUN pnpm install --frozen-lockfile

COPY --from=pre /app/out/full/ .
RUN SKIP_ENV_CHECK=true pnpm turbo run build --filter=worker

# Deploy worker with only the packages that cannot be bundled (jsdom,
# @mozilla/readability). pnpm deploy resolves the full transitive dep tree
# and produces a flat node_modules the release stage can COPY directly.
RUN pnpm --filter worker deploy --prod /app/worker-deploy

FROM base AS release
RUN apt update && \
  apt install -y tini redis && \
  apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*
COPY apps/worker/docker/rootfs/ /

COPY --from=deps /app/apps/worker/dist /app/apps/worker/dist
# Runtime node_modules for packages excluded from the bundle (jsdom, readability)
COPY --from=deps /app/worker-deploy/node_modules /app/node_modules
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
STOPSIGNAL SIGTERM
CMD ["worker", "all"]
