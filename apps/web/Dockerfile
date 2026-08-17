# Eagle marketing site (static). Build context = repo root:
#   docker build -f apps/web/Dockerfile -t eagle-web .
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm install && npm run build -w @eagle/web

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
