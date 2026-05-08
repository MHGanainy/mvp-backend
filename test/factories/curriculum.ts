import { PrismaClient } from '@prisma/client';

let counter = 0;

export async function makeCurriculum(
  prisma: PrismaClient,
  overrides?: {
    name?: string;
  },
) {
  counter++;
  return prisma.curriculum.create({
    data: {
      name: overrides?.name ?? `Test Curriculum ${counter} ${Date.now()}`,
    },
  });
}
