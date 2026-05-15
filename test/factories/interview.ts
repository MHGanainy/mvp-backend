import { PrismaClient } from '@prisma/client';
import { makeInstructor } from './instructor';

let counter = 0;

export async function makeInterview(
  prisma: PrismaClient,
  overrides?: {
    instructorId?: string;
    title?: string;
    slug?: string;
  },
) {
  counter++;
  let instructorId = overrides?.instructorId;
  if (!instructorId) {
    const { instructor } = await makeInstructor(prisma);
    instructorId = instructor.id;
  }
  const interview = await prisma.interview.create({
    data: {
      instructorId,
      title: overrides?.title ?? `Test Interview ${counter}`,
      slug: overrides?.slug ?? `test-interview-${counter}-${Date.now()}`,
    },
  });
  return { interview };
}

export async function makeInterviewCourse(
  prisma: PrismaClient,
  overrides?: {
    interviewId?: string;
    instructorId?: string;
    title?: string;
  },
) {
  counter++;
  let interviewId = overrides?.interviewId;
  let instructorId = overrides?.instructorId;
  if (!interviewId) {
    const { interview } = await makeInterview(prisma, { instructorId });
    interviewId = interview.id;
    if (!instructorId) {
      instructorId = interview.instructorId;
    }
  }
  const interviewCourse = await prisma.interviewCourse.create({
    data: {
      interviewId,
      instructorId: instructorId!,
      title: overrides?.title ?? `Test Interview Course ${counter}`,
    },
  });
  return { interviewCourse };
}

export async function makeInterviewCase(
  prisma: PrismaClient,
  overrides?: {
    interviewCourseId?: string;
    title?: string;
    diagnosis?: string;
    patientName?: string;
    patientAge?: number;
    patientGender?: string;
    description?: string;
    displayOrder?: number;
  },
) {
  counter++;
  let interviewCourseId = overrides?.interviewCourseId;
  if (!interviewCourseId) {
    const { interviewCourse } = await makeInterviewCourse(prisma);
    interviewCourseId = interviewCourse.id;
  }
  const interviewCase = await prisma.interviewCase.create({
    data: {
      interviewCourseId,
      title: overrides?.title ?? `Test Case ${counter}`,
      diagnosis: overrides?.diagnosis ?? 'Test Diagnosis',
      patientName: overrides?.patientName ?? 'Test Patient',
      patientAge: overrides?.patientAge ?? 40,
      patientGender: overrides?.patientGender ?? 'FEMALE',
      description: overrides?.description ?? 'Test description',
      displayOrder: overrides?.displayOrder ?? counter,
    },
  });
  return { interviewCase };
}

export async function makeInterviewSimulation(
  prisma: PrismaClient,
  overrides?: {
    interviewCaseId?: string;
    casePrompt?: string;
    openingLine?: string;
    timeLimitMinutes?: number;
    voiceModel?: string;
  },
) {
  let interviewCaseId = overrides?.interviewCaseId;
  if (!interviewCaseId) {
    const { interviewCase } = await makeInterviewCase(prisma);
    interviewCaseId = interviewCase.id;
  }
  const interviewSimulation = await prisma.interviewSimulation.create({
    data: {
      interviewCaseId,
      casePrompt: overrides?.casePrompt ?? 'You are an interviewer.',
      openingLine: overrides?.openingLine ?? 'Tell me about yourself.',
      timeLimitMinutes: overrides?.timeLimitMinutes ?? 15,
      voiceModel: overrides?.voiceModel ?? 'VOICE_1',
    },
  });
  return { interviewSimulation };
}
