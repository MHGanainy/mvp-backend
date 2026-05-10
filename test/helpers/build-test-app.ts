import { buildApp } from '../../src/app';
import { prisma } from './db';

export const TEST_JWT_SECRET = 'test-jwt-secret-for-testing-only';

export async function buildTestApp() {
  const app = await buildApp({
    prisma,
    jwtSecret: TEST_JWT_SECRET,
    logger: false,
    enableRateLimiting: false,
  });
  await app.ready();
  return app;
}
