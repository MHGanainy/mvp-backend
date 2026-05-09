import { PrismaClient } from '@prisma/client';
import { makeInstructor } from './instructor';

let counter = 0;

export async function makeExam(
  prisma: PrismaClient,
  overrides?: {
    instructorId?: string;
    title?: string;
    description?: string;
    isActive?: boolean;
  },
) {
  counter++;

  let instructorId = overrides?.instructorId;
  if (!instructorId) {
    const { instructor } = await makeInstructor(prisma);
    instructorId = instructor.id;
  }

  const title = overrides?.title ?? `Test Exam ${counter}`;
  const slug = `test-exam-${counter}-${Date.now()}`;

  return prisma.exam.create({
    data: {
      instructorId,
      title,
      slug,
      description: overrides?.description ?? null,
      isActive: overrides?.isActive ?? true,
    },
  });
}
