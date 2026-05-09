import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';
import { makeExam } from '../../../test/factories/exam';
import { makeInstructor } from '../../../test/factories/instructor';
import { loginAsStudent, loginAsInstructor, loginAsAdmin, grantPermission } from '../../../test/helpers/auth';

let app: FastifyInstance;
beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await app.close(); });

describe('POST /api/exams', () => {
  it('returns 401 when unauthenticated', async () => {
    const { instructor } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      payload: { instructorId: instructor.id, title: 'My Exam' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows an instructor to create an exam for themselves', async () => {
    const { instructor, headers } = await loginAsInstructor(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: { instructorId: instructor.id, title: 'My Exam' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('My Exam');
    expect(res.json().instructorId).toBe(instructor.id);
  });

  it('returns 403 when instructor creates exam for a different instructor', async () => {
    const { headers } = await loginAsInstructor(app, prisma);
    const { instructor: other } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: { instructorId: other.id, title: 'Their Exam' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows admin to create an exam for any instructor', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const { instructor } = await makeInstructor(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: { instructorId: instructor.id, title: 'Admin Created Exam' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe('Admin Created Exam');
    expect(res.json().instructorId).toBe(instructor.id);
  });

  it('returns 404 when instructorId does not exist', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: {
        instructorId: '00000000-0000-0000-0000-000000000000',
        title: 'Ghost Exam',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Instructor not found');
  });

  it('returns 400 when slug is already taken', async () => {
    const { instructor, headers } = await loginAsInstructor(app, prisma);
    await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: { instructorId: instructor.id, title: 'Dup', slug: 'dup-slug' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams',
      headers,
      payload: { instructorId: instructor.id, title: 'Dup 2', slug: 'dup-slug' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Exam with this slug already exists');
  });
});

describe('PUT /api/exams/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${exam.id}`,
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated user has no case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsInstructor(app, prisma);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${exam.id}`,
      headers,
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('updates the exam when user has case.edit permission', async () => {
    const { user, instructor, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${exam.id}`,
      headers,
      payload: { title: 'Updated Title' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Updated Title');
  });

  it('returns 404 when exam does not exist', async () => {
    const { user, headers } = await loginAsAdmin(app, prisma);
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: fakeId });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${fakeId}`,
      headers,
      payload: { title: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when updating slug to one taken by another exam', async () => {
    const { user, instructor, headers } = await loginAsInstructor(app, prisma);
    const examA = await makeExam(prisma, { instructorId: instructor.id, title: 'A' });
    const examB = await makeExam(prisma, { instructorId: instructor.id, title: 'B' });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: examB.id });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${examB.id}`,
      headers,
      payload: { slug: examA.slug },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Exam with this slug already exists');
  });

  it('returns 200 when updating slug to its own existing slug', async () => {
    const { user, instructor, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/exams/${exam.id}`,
      headers,
      payload: { slug: exam.slug },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('PATCH /api/exams/:id/toggle', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exams/${exam.id}/toggle`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user has no case.publish permission', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsInstructor(app, prisma);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exams/${exam.id}/toggle`,
      headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it('deactivates an active exam', async () => {
    const { user, instructor, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id, isActive: true });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exams/${exam.id}/toggle`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().exam.id).toBe(exam.id);
    expect(res.json().exam.isActive).toBe(false);
    expect(res.json().message).toContain('deactivated');
  });

  it('activates an inactive exam', async () => {
    const { user, instructor, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: instructor.id, isActive: false });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exams/${exam.id}/toggle`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().exam.id).toBe(exam.id);
    expect(res.json().exam.isActive).toBe(true);
    expect(res.json().message).toContain('activated');
  });

  it('returns 404 when exam does not exist', async () => {
    const { user, headers } = await loginAsAdmin(app, prisma);
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: fakeId });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/exams/${fakeId}/toggle`,
      headers,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/exams/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated as non-admin', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsStudent(app, prisma);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}`,
      headers,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when exam does not exist', async () => {
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/exams/00000000-0000-0000-0000-000000000000',
      headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes the exam and returns 204', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsAdmin(app, prisma);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}`,
      headers,
    });
    expect(res.statusCode).toBe(204);
    const deleted = await prisma.exam.findUnique({ where: { id: exam.id } });
    expect(deleted).toBeNull();
  });
});
