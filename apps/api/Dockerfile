# Eagle API — production image (Postgres + S3). Build context = repo root:
#   docker build -f apps/api/Dockerfile -t eagle-api .
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Prisma's schema engine links against libssl; node:20-bookworm-slim ships
# without it, so `prisma generate` / `db push` fail with "Schema engine error"
# and the container crash-loops. ca-certificates is needed for outbound TLS.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY . .
# This image genuinely needs Prisma's engines, and the download from
# binaries.prisma.sh drops mid-transfer on this server often enough to fail
# whole deploys with ECONNRESET. Give npm longer timeouts and retry the install
# twice more before giving up. No shell variables here on purpose: Docker
# expands $NAME in RUN against build args and would blank an undefined one.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 180000 \
 && (npm install || (echo "npm install failed — retry 1/2" && sleep 15 && npm install) \
                 || (echo "npm install failed — retry 2/2" && sleep 30 && npm install))
# Local dev uses SQLite; production uses Postgres — the models are portable.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' apps/api/prisma/schema.prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build -w @eagle/api

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Prisma's schema engine links against libssl; node:20-bookworm-slim ships
# without it, so `prisma generate` / `db push` fail with "Schema engine error"
# and the container crash-loops. ca-certificates is needed for outbound TLS.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 4000
# Sync schema (young project uses db push; swap to `migrate deploy` once migrations exist), then start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
