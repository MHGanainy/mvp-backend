import { PrismaClient } from '@prisma/client';

let counter = 0;

export async function makeCreditPackage(
  prisma: PrismaClient,
  overrides?: {
    name?: string;
    credits?: number;
    priceInCents?: number;
    description?: string;
  },
) {
  counter++;
  return prisma.creditPackage.create({
    data: {
      name: overrides?.name ?? `${overrides?.credits ?? 100} Credits`,
      credits: overrides?.credits ?? 100,
      priceInCents: overrides?.priceInCents ?? 999,
      description: overrides?.description ?? null,
    },
  });
}
