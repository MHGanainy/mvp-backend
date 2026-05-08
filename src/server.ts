import { PrismaClient } from '@prisma/client';
import { buildApp } from './app';
import { CleanupService } from './services/cleanup.service';

const prisma = new PrismaClient();

const start = async () => {
  try {
    const app = await buildApp({
      prisma,
      jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    });

    const cleanupService = new CleanupService(
      prisma,
      app.log.child({ service: 'CleanupService' }),
    );

    app.log.info('Running initial cleanup');
    await cleanupService.cleanupExpiredOTPs();

    setInterval(
      async () => {
        app.log.info('Running scheduled cleanup');
        try {
          await cleanupService.cleanupExpiredOTPs();
          await cleanupService.cleanupExpiredPendingRegistrations();
        } catch (error) {
          app.log.error({ err: error }, 'Cleanup failed');
        }
      },
      6 * 60 * 60 * 1000,
    );

    app.log.info('Cleanup service started (runs every 6 hours)');

    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info({ host, port }, 'Server running');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
