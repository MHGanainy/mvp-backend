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

export async function makeCourseCase(
  prisma: PrismaClient,
  overrides?: {
    courseId?: string;
    title?: string;
    diagnosis?: string;
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    description?: string;
    isFree?: boolean;
    isActive?: boolean;
    displayOrder?: number;
  },
) {
  counter++;
  let courseId = overrides?.courseId;
  if (!courseId) {
    const course = await makeCourse(prisma);
    courseId = course.id;
  }
  return prisma.courseCase.create({
    data: {
      courseId,
      title: overrides?.title ?? `Test Case ${counter}`,
      diagnosis: overrides?.diagnosis ?? 'Test Diagnosis',
      patientName: overrides?.patientName ?? 'Test Patient',
      patientAge: overrides?.patientAge ?? 30,
      patientGender: overrides?.patientGender ?? 'MALE',
      description: overrides?.description ?? 'Test description',
      isFree: overrides?.isFree ?? false,
      isActive: overrides?.isActive ?? true,
      displayOrder: overrides?.displayOrder ?? counter,
    },
  });
}

export async function makeSimulation(
  prisma: PrismaClient,
  overrides?: {
    courseCaseId?: string;
    casePrompt?: string;
    openingLine?: string;
    timeLimitMinutes?: number;
    voiceModel?: string;
  },
) {
  let courseCaseId = overrides?.courseCaseId;
  if (!courseCaseId) {
    const courseCase = await makeCourseCase(prisma);
    courseCaseId = courseCase.id;
  }
  return prisma.simulation.create({
    data: {
      courseCaseId,
      casePrompt: overrides?.casePrompt ?? 'prompt',
      openingLine: overrides?.openingLine ?? 'hello',
      timeLimitMinutes: overrides?.timeLimitMinutes ?? 10,
      voiceModel: overrides?.voiceModel ?? 'VOICE_1',
    },
  });
}
