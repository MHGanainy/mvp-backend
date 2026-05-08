import { PrismaClient } from '@prisma/client';
import { makeUser } from './user';

export async function makeInstructor(
  prisma: PrismaClient,
  overrides?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    bio?: string;
  },
) {
  const user = await makeUser(prisma, { email: overrides?.email });

  const instructor = await prisma.instructor.create({
    data: {
      userId: user.id,
      firstName: overrides?.firstName ?? 'Test',
      lastName: overrides?.lastName ?? 'Instructor',
      bio: overrides?.bio ?? null,
    },
  });

  return { user, instructor };
}
