# Eagle dashboard (static SPA). Build context = repo root:
#   docker build -f apps/dashboard/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t eagle-dashboard .
FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
# Sub-path the SPA is served from (e.g. "/app/"). Baked in at build time.
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
COPY . .
RUN npm install && npm run build -w @eagle/dashboard

FROM nginx:alpine
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
COPY infra/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
