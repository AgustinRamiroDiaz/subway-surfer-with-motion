import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['az.tail9d3653.ts.net'],
  },
  base: process.env.PUBLIC_URL || '/',
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
