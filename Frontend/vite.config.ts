import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Debe coincidir con CORS_ORIGIN del backend.
      port: 5173,
      strictPort: true,
      // En desarrollo /api va al backend: mismo origen, así la cookie del refresh funciona.
      proxy: {
        '/api': { target: env.VITE_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      css: false,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
      },
    },
  };
});
