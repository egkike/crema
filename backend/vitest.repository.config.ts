import { defineConfig } from 'vitest/config';
import path from 'path';

// Repository tests config - runs WITHOUT setup.ts global mocks
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [], // NO global setup
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'src/repositories/**/*.ts',
        'src/__tests__/repositories/*.test.ts'
      ],
      exclude: ['node_modules/**'],
    },
    include: ['src/__tests__/repositories/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
