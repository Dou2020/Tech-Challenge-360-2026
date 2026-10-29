import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Valores ficticios para que src/config/env.ts cargue; las unitarias no se conectan.
          env: {
            NODE_ENV: 'test',
            DB_SERVER: 'localhost',
            DB_NAME: 'ShopCart_Unit',
            DB_USER: 'shopcart_app',
            DB_PASSWORD: 'no-se-usa',
            JWT_ACCESS_SECRET: 'secreto-de-pruebas-unitarias-con-mas-de-32-caracteres',
            CORS_ORIGIN: 'http://localhost:5173',
            REDIS_URL: 'redis://localhost:6399',
          },
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/setup/globalSetup.ts'],
          setupFiles: ['tests/setup/integration.env.ts'],
          // Comparten la misma base: un archivo a la vez.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
