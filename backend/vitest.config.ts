import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './src/tests/globalSetup.ts',
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
  },
});
