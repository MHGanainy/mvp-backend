import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { resolve } from 'path';

const testEnv = loadEnv('test', resolve(__dirname, '.'), '');

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    env: testEnv,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
