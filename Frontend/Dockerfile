# Imagen del frontend de ShopCart: build de Vite servido por nginx.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Mismo origen que el sitio: nginx reenvía /api al backend.
ENV VITE_API_URL=/api
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
