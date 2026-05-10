import { PrismaClient } from '@prisma/client';
import { makeExam } from './exam';
import { makeInstructor } from './instructor';

let counter = 0;

export async function makeCourse(
  prisma: PrismaClient,
  overrides?: {
    examId?: string;
    instructorId?: string;
    title?: string;
    description?: string;
    isPublished?: boolean;
  },
) {
  counter++;

  let instructorId = overrides?.instructorId;
  let examId = overrides?.examId;

  if (!instructorId) {
    const { instructor } = await makeInstructor(prisma);
    instructorId = instructor.id;
  }

  if (!examId) {
    const exam = await makeExam(prisma, { instructorId });
    examId = exam.id;
  }

  const title = overrides?.title ?? `Test Course ${counter}`;
  const slug = `test-course-${counter}-${Date.now()}`;

  return prisma.course.create({
    data: {
      examId,
      instructorId,
      title,
      slug,
      description: overrides?.description ?? null,
      isPublished: overrides?.isPublished ?? false,
    },
  });
}
