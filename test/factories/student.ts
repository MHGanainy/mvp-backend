import { PrismaClient } from '@prisma/client';
import { makeUser } from './user';

export async function makeStudent(
  prisma: PrismaClient,
  overrides?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    creditBalance?: number;
    isAdmin?: boolean;
  },
) {
  const user = await makeUser(prisma, {
    email: overrides?.email,
    password: overrides?.password,
    isAdmin: overrides?.isAdmin,
  });

  const student = await prisma.student.create({
    data: {
      userId: user.id,
      firstName: overrides?.firstName ?? 'Test',
      lastName: overrides?.lastName ?? 'Student',
      creditBalance: overrides?.creditBalance ?? 0,
    },
  });

  return { user, student };
}
