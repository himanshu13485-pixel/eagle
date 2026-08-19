# Eagle marketing site (static). Build context = repo root:
#   docker build -f apps/web/Dockerfile -t eagle-web .
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Where the marketing site's Login / Sign up buttons point. Baked in at build time.
ARG VITE_DASHBOARD_URL=http://localhost:5173
ENV VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL
COPY . .
# --ignore-scripts: this installs the whole monorepo, so without it npm runs
# the API's Prisma postinstall — a large engine download the SPA never uses.
# It made the image slow and failed the build outright on a network blip.
# Vite's esbuild/rollup binaries come from optional deps, not postinstall, so
# skipping scripts is safe here.
RUN npm install --ignore-scripts && npm run build -w @eagle/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
