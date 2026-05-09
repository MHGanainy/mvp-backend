import { FastifyInstance } from 'fastify';
import { PrismaClient, PermissionRole, PermissionResourceType } from '@prisma/client';
import { makeStudent } from '../factories/student';
import { makeInstructor } from '../factories/instructor';
import { makeUser } from '../factories/user';

export async function grantPermission(
  prisma: PrismaClient,
  args: {
    userId: number;
    role: PermissionRole;
    resourceType: PermissionResourceType;
    resourceId: string;
  },
) {
  await prisma.permissionGrant.upsert({
    where: {
      userId_role_resourceType_resourceId: {
        userId: args.userId,
        role: args.role,
        resourceType: args.resourceType,
        resourceId: args.resourceId,
      },
    },
    create: {
      userId: args.userId,
      role: args.role,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      grantedById: args.userId,
    },
    update: {},
  });
}

export async function loginAsStudent(
  app: FastifyInstance,
  prisma: PrismaClient,
  overrides?: {
    email?: string;
    creditBalance?: number;
    isAdmin?: boolean;
  },
) {
  const { user, student } = await makeStudent(prisma, overrides);
  const token = app.jwt.sign({
    userId: user.id,
    role: 'student' as const,
    email: user.email,
    isAdmin: user.isAdmin,
    studentId: student.id,
  });
  return { token, user, student, headers: { authorization: `Bearer ${token}` } };
}

export async function loginAsInstructor(
  app: FastifyInstance,
  prisma: PrismaClient,
  overrides?: {
    email?: string;
  },
) {
  const { user, instructor } = await makeInstructor(prisma, overrides);
  const token = app.jwt.sign({
    userId: user.id,
    role: 'instructor' as const,
    email: user.email,
    isAdmin: user.isAdmin,
    instructorId: instructor.id,
  });
  return { token, user, instructor, headers: { authorization: `Bearer ${token}` } };
}

export async function loginAsAdmin(
  app: FastifyInstance,
  prisma: PrismaClient,
  overrides?: {
    email?: string;
  },
) {
  const user = await makeUser(prisma, { email: overrides?.email, isAdmin: true });
  const student = await prisma.student.create({
    data: { userId: user.id, firstName: 'Admin', lastName: 'User', creditBalance: 999999 },
  });
  const token = app.jwt.sign({
    userId: user.id,
    role: 'student' as const,
    email: user.email,
    isAdmin: true,
    studentId: student.id,
  });
  return { token, user, student, headers: { authorization: `Bearer ${token}` } };
}
