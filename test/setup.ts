import { beforeEach, afterEach, vi } from 'vitest';
import { prisma, truncateAll } from './helpers/db';

if (process.env.TEST_MODE !== '1') {
  throw new Error(
    'TEST_MODE=1 is not set.\n' +
    'Create .env.test from .env.test.example before running tests.\n' +
    'This prevents accidental truncation of non-test databases.',
  );
}

beforeEach(async () => {
  await truncateAll(prisma);
});

afterEach(() => {
  vi.clearAllMocks();
});
