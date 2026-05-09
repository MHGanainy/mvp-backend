import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';
import { makeExam } from '../../../test/factories/exam';
import { makeInstructor } from '../../../test/factories/instructor';
import { makeSpecialty } from '../../../test/factories/specialty';
import { makeCurriculum } from '../../../test/factories/curriculum';
import { loginAsInstructor, loginAsAdmin, loginAsStudent, grantPermission } from '../../../test/helpers/auth';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/exams/create-complete', () => {
  it('returns 401 when unauthenticated', async () => {
    const { instructor } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      payload: {
        exam: { instructorId: instructor.id, title: 'New Exam' },
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated as a non-admin instructor', async () => {
    const { instructor } = await makeInstructor(prisma);
    const { headers } = await loginAsInstructor(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'New Exam' },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when the instructor is not found', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: {
          instructorId: '00000000-0000-0000-0000-000000000000',
          title: 'Ghost Instructor Exam',
        },
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when the slug is already taken', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const existing = await makeExam(prisma, { instructorId: instructor.id });
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'Dup Slug Exam', slug: existing.slug },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when existing.specialtyIds contains a non-existent ID', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'Bad Specialty Exam' },
        existing: { specialtyIds: ['00000000-0000-0000-0000-000000000001'] },
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 201 with no relations when only basic exam data is provided', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'Basic Exam' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message).toBeDefined();
    expect(body.exam).toBeDefined();
    expect(body.summary.totalSpecialties).toBe(0);
  });

  it('returns 201 and populates assigned when existing IDs are supplied', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const specialty = await makeSpecialty(prisma);
    const curriculum = await makeCurriculum(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain A' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'Full Exam' },
        existing: {
          specialtyIds: [specialty.id],
          curriculumIds: [curriculum.id],
          markingDomainIds: [domain.id],
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.assigned.specialties.map((s: { id: string }) => s.id)).toContain(specialty.id);
    expect(body.assigned.curriculums.map((c: { id: string }) => c.id)).toContain(curriculum.id);
    expect(body.assigned.markingDomains.map((d: { id: string }) => d.id)).toContain(domain.id);
  });

  it('reuses an existing specialty when new.specialties name matches case-insensitively', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const existingName = `Cardiology-${Date.now()}`;
    await makeSpecialty(prisma, { name: existingName });

    const countBefore = await prisma.specialty.count({ where: { name: { equals: existingName, mode: 'insensitive' } } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/create-complete',
      headers,
      payload: {
        exam: { instructorId: instructor.id, title: 'Reuse Specialty Exam' },
        new: { specialties: [{ name: existingName.toUpperCase() }] },
      },
    });

    expect(res.statusCode).toBe(201);
    const countAfter = await prisma.specialty.count({ where: { name: { equals: existingName, mode: 'insensitive' } } });
    expect(countAfter).toBe(countBefore);
  });
});

describe('PUT /api/exams/update-complete', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      payload: { examId: exam.id, exam: { title: 'Updated' } },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when the user does not have case.edit permission', async () => {
    const { headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers,
      payload: { examId: exam.id, exam: { title: 'Sneaky Update' } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when the exam does not exist', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers,
      payload: {
        examId: '00000000-0000-0000-0000-000000000000',
        exam: { title: 'No Exam' },
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when the new slug is already taken by another exam', async () => {
    const { user, instructor } = await loginAsInstructor(app, prisma);
    const examA = await makeExam(prisma, { instructorId: instructor.id });
    const examB = await makeExam(prisma, { instructorId: instructor.id });

    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: examB.id });

    const token = app.jwt.sign({
      userId: user.id,
      role: 'instructor' as const,
      email: user.email,
      isAdmin: false,
      instructorId: instructor.id,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { examId: examB.id, exam: { slug: examA.slug } },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when existing entity IDs do not exist', async () => {
    const { user, instructor } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id });

    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const token = app.jwt.sign({
      userId: user.id,
      role: 'instructor' as const,
      email: user.email,
      isAdmin: false,
      instructorId: instructor.id,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        examId: exam.id,
        existing: { specialtyIds: ['00000000-0000-0000-0000-000000000002'] },
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 and updates the exam title', async () => {
    const { user, instructor } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id });

    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const token = app.jwt.sign({
      userId: user.id,
      role: 'instructor' as const,
      email: user.email,
      isAdmin: false,
      instructorId: instructor.id,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { examId: exam.id, exam: { title: 'Updated Title' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().exam.title).toBe('Updated Title');
  });

  it('returns 200 and replaces junction assignments', async () => {
    const { user, instructor } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id });
    const specialty = await makeSpecialty(prisma);

    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const token = app.jwt.sign({
      userId: user.id,
      role: 'instructor' as const,
      email: user.email,
      isAdmin: false,
      instructorId: instructor.id,
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/exams/update-complete',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        examId: exam.id,
        existing: { specialtyIds: [specialty.id] },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.assigned.specialties.map((s: { id: string }) => s.id)).toContain(specialty.id);
  });
});

describe('POST /api/exams/:examId/duplicate', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/duplicate`,
      payload: { title: 'Copy of Exam' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when a student (no instructor profile) tries to duplicate', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsStudent(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/duplicate`,
      headers,
      payload: { title: 'Copy of Exam' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Could not determine instructor');
  });

  it('returns 404 when the source exam does not exist', async () => {
    const { headers } = await loginAsInstructor(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/duplicate',
      headers,
      payload: { title: 'Copy of Ghost Exam' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when admin specifies a non-existent instructorId', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/duplicate`,
      headers,
      payload: {
        title: 'Copy',
        instructorId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when the desired slug is already taken', async () => {
    const { headers, instructor } = await loginAsInstructor(app, prisma);
    const source = await makeExam(prisma, { instructorId: instructor.id });
    const other = await makeExam(prisma, { instructorId: instructor.id });
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${source.id}/duplicate`,
      headers,
      payload: { title: 'Copy', slug: other.slug },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 201 with isActive false when an instructor duplicates to themselves', async () => {
    const { headers, instructor } = await loginAsInstructor(app, prisma);
    const source = await makeExam(prisma, { instructorId: instructor.id, isActive: true });
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${source.id}/duplicate`,
      headers,
      payload: { title: 'My Copy' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.exam.id).not.toBe(source.id);
    expect(body.exam.title).toBe('My Copy');
    expect(body.exam.isActive).toBe(false);
    expect(body.exam.instructorId).toBe(instructor.id);
  });

  it('returns 201 and assigns the new exam to the specified instructor when admin provides instructorId', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor: sourceInstructor } = await makeInstructor(prisma);
    const { instructor: targetInstructor } = await makeInstructor(prisma);
    const source = await makeExam(prisma, { instructorId: sourceInstructor.id });
    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${source.id}/duplicate`,
      headers,
      payload: { title: 'Admin Copy', instructorId: targetInstructor.id },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().exam.instructorId).toBe(targetInstructor.id);
  });
});
