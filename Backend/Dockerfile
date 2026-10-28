# Imagen del backend de ShopCart.
# Debian (glibc) para usar los binarios precompilados de argon2.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/docs/openapi.yaml ./src/docs/openapi.yaml
USER node
EXPOSE 4000
# Las variables de entorno las entrega docker compose.
CMD ["node", "dist/server.js"]
