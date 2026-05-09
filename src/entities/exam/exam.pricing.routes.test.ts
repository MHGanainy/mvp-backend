import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';
import { makeExam } from '../../../test/factories/exam';
import { makeCourse } from '../../../test/factories/course';
import { loginAsStudent, loginAsAdmin } from '../../../test/helpers/auth';

let app: FastifyInstance;
beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await app.close(); });

async function createSubscription(studentId: string, resourceType: 'BUNDLE' | 'COURSE', resourceId: string) {
  const payment = await prisma.payment.create({
    data: {
      studentId,
      stripePaymentId: `pi_test_${Math.random().toString(36).slice(2)}`,
      amount: 99,
      paymentType: 'SUBSCRIPTION',
      paymentStatus: 'COMPLETED',
    },
  });
  return prisma.subscription.create({
    data: {
      studentId,
      paymentId: payment.id,
      resourceType,
      resourceId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      isActive: true,
    },
  });
}

describe('GET /api/exams/:examId/pricing-summary', () => {
  it('returns 404 for an inactive exam', async () => {
    const exam = await makeExam(prisma, { isActive: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Exam not found');
  });

  it('returns 404 for a non-existent exam ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/pricing-summary',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns summary without studentAccess when unauthenticated', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exam.id).toBe(exam.id);
    expect(Array.isArray(body.bundlePlans)).toBe(true);
    expect(Array.isArray(body.courses)).toBe(true);
    expect(body.studentAccess).toBeNull();
  });

  it('returns hasAccess false when student has no subscription', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const { headers } = await loginAsStudent(app, prisma);
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().studentAccess).toEqual({ hasAccess: false, via: null });
  });

  it('returns hasAccess true via BUNDLE when student has active bundle subscription', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const { student, headers } = await loginAsStudent(app, prisma);
    await createSubscription(student.id, 'BUNDLE', exam.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().studentAccess).toEqual({ hasAccess: true, via: 'BUNDLE' });
  });

  it('returns hasAccess true via COURSE when student has active course subscription', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const course = await makeCourse(prisma, { examId: exam.id, isPublished: true });
    const { student, headers } = await loginAsStudent(app, prisma);
    await createSubscription(student.id, 'COURSE', course.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().studentAccess).toEqual({ hasAccess: true, via: 'COURSE' });
  });

  it('returns hasAccess true via ADMIN for an admin user', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/pricing-summary`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().studentAccess).toEqual({ hasAccess: true, via: 'ADMIN' });
  });
});

describe('GET /api/exams/slug/:slug/pricing-summary', () => {
  it('returns 404 for an inactive exam', async () => {
    const exam = await makeExam(prisma, { isActive: false });
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/slug/${exam.slug}/pricing-summary`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns summary without studentAccess when unauthenticated', async () => {
    const exam = await makeExam(prisma, { isActive: true });
    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/slug/${exam.slug}/pricing-summary`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exam.slug).toBe(exam.slug);
    expect(body.studentAccess).toBeNull();
  });
});
