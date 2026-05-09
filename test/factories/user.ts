import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

let counter = 0;

export async function makeUser(
  prisma: PrismaClient,
  overrides?: {
    email?: string;
    name?: string;
    password?: string;
    passwordHash?: string;
    emailVerified?: boolean;
    isAdmin?: boolean;
  },
) {
  counter++;
  const passwordHash = overrides?.password
    ? await bcrypt.hash(overrides.password, 4)
    : (overrides?.passwordHash ?? null);

  return prisma.user.create({
    data: {
      email: overrides?.email ?? `user-${counter}-${Date.now()}@example.com`,
      name: overrides?.name ?? `Test User ${counter}`,
      emailVerified: overrides?.emailVerified ?? true,
      passwordHash,
      isAdmin: overrides?.isAdmin ?? false,
    },
  });
}
