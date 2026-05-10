import { PrismaClient } from '@prisma/client';

let counter = 0;

export async function makeSpecialty(
  prisma: PrismaClient,
  overrides?: {
    name?: string;
  },
) {
  counter++;
  return prisma.specialty.create({
    data: {
      name: overrides?.name ?? `Test Specialty ${counter} ${Date.now()}`,
    },
  });
}
