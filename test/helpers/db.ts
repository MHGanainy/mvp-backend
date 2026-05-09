import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function truncateAll(client: PrismaClient) {
  const tables = await client.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename != '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}
