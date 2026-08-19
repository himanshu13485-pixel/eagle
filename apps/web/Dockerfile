# Eagle marketing site (static). Build context = repo root:
#   docker build -f apps/web/Dockerfile -t eagle-web .
FROM node:20-bookworm-slim AS build
WORKDIR /app
# Where the marketing site's Login / Sign up buttons point. Baked in at build time.
ARG VITE_DASHBOARD_URL=http://localhost:5173
ENV VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL
COPY . .
RUN npm install && npm run build -w @eagle/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
