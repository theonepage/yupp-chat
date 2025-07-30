import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/mocks/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      'tests/e2e/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only.js'),
    },
  },
});