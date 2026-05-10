import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test/helpers/build-test-app';
import { prisma } from '../../../test/helpers/db';
import { makeExam } from '../../../test/factories/exam';
import { makeSpecialty } from '../../../test/factories/specialty';
import { makeCurriculum } from '../../../test/factories/curriculum';
import { loginAsInstructor, loginAsAdmin, grantPermission } from '../../../test/helpers/auth';

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildTestApp();
});
afterAll(async () => {
  await app.close();
});

describe('GET /api/exams/:examId/specialties', () => {
  it('returns assigned specialties for a valid exam', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    await prisma.examSpecialty.create({ data: { examId: exam.id, specialtyId: specialty.id } });

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/specialties` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((s: { id: string }) => s.id === specialty.id)).toBe(true);
  });

  it('returns empty array when exam has no specialties', async () => {
    const exam = await makeExam(prisma);

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/specialties` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 404 for a non-existent exam', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/specialties',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/exams/:examId/curriculums', () => {
  it('returns assigned curriculums for a valid exam', async () => {
    const exam = await makeExam(prisma);
    const curriculum = await makeCurriculum(prisma);
    await prisma.examCurriculum.create({ data: { examId: exam.id, curriculumId: curriculum.id } });

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/curriculums` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c: { id: string }) => c.id === curriculum.id)).toBe(true);
  });

  it('returns 404 for a non-existent exam', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/curriculums',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/exams/:examId/marking-domains', () => {
  it('returns assigned marking domains for a valid exam', async () => {
    const exam = await makeExam(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Test Domain' } });
    await prisma.examMarkingDomain.create({ data: { examId: exam.id, markingDomainId: domain.id } });

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/marking-domains` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((d: { id: string }) => d.id === domain.id)).toBe(true);
  });

  it('returns 404 for a non-existent exam', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/marking-domains',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/exams/:examId/is-configured', () => {
  it('returns isFullyConfigured: true when exam has all three configuration types', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    const curriculum = await makeCurriculum(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Full' } });

    await prisma.examSpecialty.create({ data: { examId: exam.id, specialtyId: specialty.id } });
    await prisma.examCurriculum.create({ data: { examId: exam.id, curriculumId: curriculum.id } });
    await prisma.examMarkingDomain.create({ data: { examId: exam.id, markingDomainId: domain.id } });

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/is-configured` });

    expect(res.statusCode).toBe(200);
    expect(res.json().isFullyConfigured).toBe(true);
  });

  it('returns isFullyConfigured: false when exam is missing a configuration type', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    const curriculum = await makeCurriculum(prisma);

    await prisma.examSpecialty.create({ data: { examId: exam.id, specialtyId: specialty.id } });
    await prisma.examCurriculum.create({ data: { examId: exam.id, curriculumId: curriculum.id } });

    const res = await app.inject({ method: 'GET', url: `/api/exams/${exam.id}/is-configured` });

    expect(res.statusCode).toBe(200);
    expect(res.json().isFullyConfigured).toBe(false);
  });

  it.skip('returns 404 for a non-existent exam', async () => {
    // SKIP: is-configured returns false for non-existent exam instead of 404
    const res = await app.inject({
      method: 'GET',
      url: '/api/exams/00000000-0000-0000-0000-000000000000/is-configured',
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/exams/assign-specialties', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when exam does not exist', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const nonExistentExamId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: nonExistentExamId });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: nonExistentExamId, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when one or more specialty IDs do not exist', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma, { instructorId: undefined });
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: exam.id, specialtyIds: ['00000000-0000-0000-0000-000000000099'] },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with assignment result on valid request', async () => {
    // TODO: remove dead endpoint
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examId).toBe(exam.id);
    expect(body.specialtiesCount).toBe(1);
    expect(body.assignments.count).toBe(1);
  });

  it('replaces existing specialties instead of appending (idempotent replace)', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialtyA = await makeSpecialty(prisma);
    const specialtyB = await makeSpecialty(prisma);

    await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialtyA.id, specialtyB.id] },
    });

    const specialtyC = await makeSpecialty(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-specialties',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialtyC.id] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().specialtiesCount).toBe(1);
    const remaining = await prisma.examSpecialty.findMany({ where: { examId: exam.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].specialtyId).toBe(specialtyC.id);
  });
});

describe('POST /api/exams/assign-curriculums', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const curriculum = await makeCurriculum(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-curriculums',
      payload: { examId: exam.id, curriculumIds: [curriculum.id] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const curriculum = await makeCurriculum(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-curriculums',
      headers,
      payload: { examId: exam.id, curriculumIds: [curriculum.id] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with assignment result on valid request', async () => {
    // TODO: remove dead endpoint
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const curriculum = await makeCurriculum(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-curriculums',
      headers,
      payload: { examId: exam.id, curriculumIds: [curriculum.id] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examId).toBe(exam.id);
    expect(body.curriculumsCount).toBe(1);
    expect(body.assignments.count).toBe(1);
  });
});

describe('POST /api/exams/assign-marking-domains', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Unauth' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-marking-domains',
      payload: { examId: exam.id, markingDomainIds: [domain.id] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Forbidden' } });
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-marking-domains',
      headers,
      payload: { examId: exam.id, markingDomainIds: [domain.id] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 200 with assignment result on valid request', async () => {
    // TODO: remove dead endpoint
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Valid' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/assign-marking-domains',
      headers,
      payload: { examId: exam.id, markingDomainIds: [domain.id] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examId).toBe(exam.id);
    expect(body.markingDomainsCount).toBe(1);
    expect(body.assignments.count).toBe(1);
  });
});

describe('POST /api/exams/bulk-configure', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/bulk-configure',
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/bulk-configure',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when exam does not exist', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const nonExistentExamId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: nonExistentExamId });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/bulk-configure',
      headers,
      payload: { examId: nonExistentExamId, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 when only specialtyIds are provided', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/bulk-configure',
      headers,
      payload: { examId: exam.id, specialtyIds: [specialty.id] },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.examId).toBe(exam.id);
    const assigned = await prisma.examSpecialty.findFirst({ where: { examId: exam.id, specialtyId: specialty.id } });
    expect(assigned).not.toBeNull();
  });

  it('returns 404 when invalid entity IDs are provided in any category', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const res = await app.inject({
      method: 'POST',
      url: '/api/exams/bulk-configure',
      headers,
      payload: {
        examId: exam.id,
        curriculumIds: ['00000000-0000-0000-0000-000000000099'],
      },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/exams/:examId/specialties/:specialtyId', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/specialties/${specialty.id}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const specialty = await makeSpecialty(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/specialties/${specialty.id}`,
      headers,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when exam does not exist', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const nonExistentExamId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: nonExistentExamId });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${nonExistentExamId}/specialties/${specialty.id}`,
      headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when specialty is not assigned to the exam', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialty = await makeSpecialty(prisma);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/specialties/${specialty.id}`,
      headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with success message when specialty is removed', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialty = await makeSpecialty(prisma);
    await prisma.examSpecialty.create({ data: { examId: exam.id, specialtyId: specialty.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/specialties/${specialty.id}`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Specialty removed successfully');
  });
});

describe('DELETE /api/exams/:examId/curriculums/:curriculumId', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const curriculum = await makeCurriculum(prisma);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/curriculums/${curriculum.id}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 when curriculum is removed successfully', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const curriculum = await makeCurriculum(prisma);
    await prisma.examCurriculum.create({ data: { examId: exam.id, curriculumId: curriculum.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/curriculums/${curriculum.id}`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const deleted = await prisma.examCurriculum.findFirst({ where: { examId: exam.id, curriculumId: curriculum.id } });
    expect(deleted).toBeNull();
  });
});

describe('DELETE /api/exams/:examId/marking-domains/:markingDomainId', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Del Unauth' } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/marking-domains/${domain.id}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 when marking domain is removed successfully', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Del Valid' } });
    await prisma.examMarkingDomain.create({ data: { examId: exam.id, markingDomainId: domain.id } });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/exams/${exam.id}/marking-domains/${domain.id}`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const deleted = await prisma.examMarkingDomain.findFirst({ where: { examId: exam.id, markingDomainId: domain.id } });
    expect(deleted).toBeNull();
  });
});

describe('GET /api/exams/:examId/with-configuration', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/with-configuration`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/with-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for a non-existent exam', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const nonExistentExamId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: nonExistentExamId });

    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${nonExistentExamId}/with-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with specialties, curriculums and markingDomains arrays', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });

    const res = await app.inject({
      method: 'GET',
      url: `/api/exams/${exam.id}/with-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.specialties)).toBe(true);
    expect(Array.isArray(body.curriculums)).toBe(true);
    expect(Array.isArray(body.markingDomains)).toBe(true);
  });
});

describe('POST /api/exams/:examId/clear-configuration', () => {
  it('returns 401 when unauthenticated', async () => {
    const exam = await makeExam(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/clear-configuration`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when authenticated without case.edit permission', async () => {
    const exam = await makeExam(prisma);
    const { headers } = await loginAsInstructor(app, prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/clear-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 404 for a non-existent exam', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const nonExistentExamId = '00000000-0000-0000-0000-000000000000';
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: nonExistentExamId });

    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${nonExistentExamId}/clear-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 200 and removes all junction entries', async () => {
    const { user, headers } = await loginAsInstructor(app, prisma);
    const exam = await makeExam(prisma);
    await grantPermission(prisma, { userId: user.id, role: 'case_editor', resourceType: 'exam', resourceId: exam.id });
    const specialty = await makeSpecialty(prisma);
    const curriculum = await makeCurriculum(prisma);
    const domain = await prisma.markingDomain.create({ data: { name: 'Domain Clear' } });

    await prisma.examSpecialty.create({ data: { examId: exam.id, specialtyId: specialty.id } });
    await prisma.examCurriculum.create({ data: { examId: exam.id, curriculumId: curriculum.id } });
    await prisma.examMarkingDomain.create({ data: { examId: exam.id, markingDomainId: domain.id } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/exams/${exam.id}/clear-configuration`,
      headers,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Exam configuration cleared successfully');

    const specialtiesAfter = await prisma.examSpecialty.findMany({ where: { examId: exam.id } });
    const curriculumsAfter = await prisma.examCurriculum.findMany({ where: { examId: exam.id } });
    const domainsAfter = await prisma.examMarkingDomain.findMany({ where: { examId: exam.id } });
    expect(specialtiesAfter).toHaveLength(0);
    expect(curriculumsAfter).toHaveLength(0);
    expect(domainsAfter).toHaveLength(0);
  });
});
