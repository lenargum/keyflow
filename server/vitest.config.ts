import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Тесты гонок делят одну базу и один пул ключей — только последовательно.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
