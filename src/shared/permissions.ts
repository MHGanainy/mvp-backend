import { PermissionResourceType, PermissionRole, Prisma, PrismaClient } from '@prisma/client'

type TxClient = Prisma.TransactionClient | PrismaClient

export type Permission =
  | 'case.create'
  | 'case.edit'
  | 'case.publish'
  | 'case.delete'

export const ROLE_PERMISSIONS: Record<PermissionRole, ReadonlyArray<Permission>> = {
  case_collaborator: ['case.create', 'case.edit'],
  case_editor: ['case.create', 'case.edit', 'case.publish'],
}

export type ResourceTarget =
  | { kind: 'exam'; id: string }
  | { kind: 'course'; id: string }
  | { kind: 'course_case'; id: string }
  | { kind: 'interview'; id: string }
  | { kind: 'interview_course'; id: string }
  | { kind: 'interview_case'; id: string }

export type Ancestor = { resourceType: PermissionResourceType; resourceId: string }

export async function resolveAncestors(
  prisma: PrismaClient,
  target: ResourceTarget,
): Promise<Ancestor[]> {
  switch (target.kind) {
    case 'exam': {
      return [{ resourceType: 'exam', resourceId: target.id }]
    }
    case 'course': {
      const course = await prisma.course.findUnique({
        where: { id: target.id },
        select: { examId: true },
      })
      if (!course) {
        return []
      }
      return [
        { resourceType: 'course', resourceId: target.id },
        { resourceType: 'exam', resourceId: course.examId },
      ]
    }
    case 'course_case': {
      const courseCase = await prisma.courseCase.findUnique({
        where: { id: target.id },
        select: { courseId: true, course: { select: { examId: true } } },
      })
      if (!courseCase) {
        return []
      }
      return [
        { resourceType: 'course', resourceId: courseCase.courseId },
        { resourceType: 'exam', resourceId: courseCase.course.examId },
      ]
    }
    case 'interview': {
      return [{ resourceType: 'interview', resourceId: target.id }]
    }
    case 'interview_course': {
      const interviewCourse = await prisma.interviewCourse.findUnique({
        where: { id: target.id },
        select: { interviewId: true },
      })
      if (!interviewCourse) {
        return []
      }
      return [
        { resourceType: 'interview_course', resourceId: target.id },
        { resourceType: 'interview', resourceId: interviewCourse.interviewId },
      ]
    }
    case 'interview_case': {
      const interviewCase = await prisma.interviewCase.findUnique({
        where: { id: target.id },
        select: {
          interviewCourseId: true,
          interviewCourse: { select: { interviewId: true } },
        },
      })
      if (!interviewCase) {
        return []
      }
      return [
        { resourceType: 'interview_course', resourceId: interviewCase.interviewCourseId },
        { resourceType: 'interview', resourceId: interviewCase.interviewCourse.interviewId },
      ]
    }
  }
}

export async function userHasAnyPermission(
  prisma: PrismaClient,
  args: {
    userId: number
    isAdmin: boolean
    permissions: ReadonlyArray<Permission>
    target: ResourceTarget
  },
): Promise<boolean> {
  if (args.isAdmin) {
    return true
  }
  if (args.permissions.length === 0) {
    return false
  }
  const ancestors = await resolveAncestors(prisma, args.target)
  if (ancestors.length === 0) {
    return false
  }
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId: args.userId,
      OR: ancestors.map((a) => ({
        resourceType: a.resourceType,
        resourceId: a.resourceId,
      })),
    },
    select: { role: true },
  })
  for (const grant of grants) {
    for (const permission of ROLE_PERMISSIONS[grant.role]) {
      if (args.permissions.includes(permission)) {
        return true
      }
    }
  }
  return false
}

export async function userHasPermission(
  prisma: PrismaClient,
  args: {
    userId: number
    isAdmin: boolean
    permission: Permission
    target: ResourceTarget
  },
): Promise<boolean> {
  return userHasAnyPermission(prisma, {
    userId: args.userId,
    isAdmin: args.isAdmin,
    permissions: [args.permission],
    target: args.target,
  })
}

export async function userGrantsForResource(
  prisma: PrismaClient,
  userId: number,
  target: ResourceTarget,
): Promise<ReadonlyArray<Permission>> {
  const ancestors = await resolveAncestors(prisma, target)
  if (ancestors.length === 0) {
    return []
  }
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId,
      OR: ancestors.map((a) => ({
        resourceType: a.resourceType,
        resourceId: a.resourceId,
      })),
    },
    select: { role: true },
  })
  const set = new Set<Permission>()
  for (const grant of grants) {
    for (const permission of ROLE_PERMISSIONS[grant.role]) {
      set.add(permission)
    }
  }
  return Array.from(set)
}

export async function userHasAnyGrantOnExam(
  prisma: PrismaClient,
  userId: number,
  examId: string,
): Promise<boolean> {
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      resourceType: { in: ['exam', 'course'] },
      OR: [
        { resourceType: 'exam', resourceId: examId },
        {
          resourceType: 'course',
          resourceId: { in: (await prisma.course.findMany({ where: { examId }, select: { id: true } })).map((c) => c.id) },
        },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}

export async function userHasAnyGrantOnCourse(
  prisma: PrismaClient,
  userId: number,
  courseId: string,
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { examId: true },
  })
  if (!course) {
    return false
  }
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      OR: [
        { resourceType: 'course', resourceId: courseId },
        { resourceType: 'exam', resourceId: course.examId },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}

export async function userHasAnyGrantOnInterview(
  prisma: PrismaClient,
  userId: number,
  interviewId: string,
): Promise<boolean> {
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      OR: [
        { resourceType: 'interview', resourceId: interviewId },
        {
          resourceType: 'interview_course',
          resourceId: { in: (await prisma.interviewCourse.findMany({ where: { interviewId }, select: { id: true } })).map((ic) => ic.id) },
        },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}

export type Viewer = { userId: number | null; isAdmin: boolean }

async function getViewerCourseIds(prisma: PrismaClient, userId: number): Promise<string[]> {
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId,
      resourceType: { in: ['exam', 'course'] },
    },
    select: { resourceType: true, resourceId: true },
  })
  if (grants.length === 0) {
    return []
  }
  const courseIdSet = new Set<string>()
  const examIds: string[] = []
  for (const g of grants) {
    if (g.resourceType === 'course') {
      courseIdSet.add(g.resourceId)
    } else if (g.resourceType === 'exam') {
      examIds.push(g.resourceId)
    }
  }
  if (examIds.length > 0) {
    const courses = await prisma.course.findMany({
      where: { examId: { in: examIds } },
      select: { id: true },
    })
    for (const c of courses) {
      courseIdSet.add(c.id)
    }
  }
  return Array.from(courseIdSet)
}

async function getViewerInterviewCourseIds(prisma: PrismaClient, userId: number): Promise<string[]> {
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId,
      resourceType: { in: ['interview', 'interview_course'] },
    },
    select: { resourceType: true, resourceId: true },
  })
  if (grants.length === 0) {
    return []
  }
  const interviewCourseIdSet = new Set<string>()
  const interviewIds: string[] = []
  for (const g of grants) {
    if (g.resourceType === 'interview_course') {
      interviewCourseIdSet.add(g.resourceId)
    } else if (g.resourceType === 'interview') {
      interviewIds.push(g.resourceId)
    }
  }
  if (interviewIds.length > 0) {
    const interviewCourses = await prisma.interviewCourse.findMany({
      where: { interviewId: { in: interviewIds } },
      select: { id: true },
    })
    for (const ic of interviewCourses) {
      interviewCourseIdSet.add(ic.id)
    }
  }
  return Array.from(interviewCourseIdSet)
}

export async function getVisibleCourseCasesWhere(
  prisma: PrismaClient,
  viewer: Viewer,
): Promise<Prisma.CourseCaseWhereInput> {
  if (viewer.isAdmin) {
    return {}
  }
  const publicWhere: Prisma.CourseCaseWhereInput = {
    isPublished: true,
    course: { isPublished: true },
  }
  if (viewer.userId === null) {
    return publicWhere
  }
  const courseIds = await getViewerCourseIds(prisma, viewer.userId)
  if (courseIds.length === 0) {
    return publicWhere
  }
  return {
    OR: [publicWhere, { courseId: { in: courseIds } }],
  }
}

export async function getVisibleInterviewCasesWhere(
  prisma: PrismaClient,
  viewer: Viewer,
): Promise<Prisma.InterviewCaseWhereInput> {
  if (viewer.isAdmin) {
    return {}
  }
  const publicWhere: Prisma.InterviewCaseWhereInput = {
    isPublished: true,
    interviewCourse: { isPublished: true },
  }
  if (viewer.userId === null) {
    return publicWhere
  }
  const interviewCourseIds = await getViewerInterviewCourseIds(prisma, viewer.userId)
  if (interviewCourseIds.length === 0) {
    return publicWhere
  }
  return {
    OR: [publicWhere, { interviewCourseId: { in: interviewCourseIds } }],
  }
}

export async function canViewerSeeCourseCase(
  prisma: PrismaClient,
  viewer: Viewer,
  courseCaseId: string,
): Promise<boolean> {
  if (viewer.isAdmin) {
    return true
  }
  const c = await prisma.courseCase.findUnique({
    where: { id: courseCaseId },
    select: {
      isPublished: true,
      courseId: true,
      course: { select: { examId: true, isPublished: true } },
    },
  })
  if (!c) {
    return false
  }
  if (c.isPublished && c.course.isPublished) {
    return true
  }
  if (viewer.userId === null) {
    return false
  }
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId: viewer.userId,
      OR: [
        { resourceType: 'course', resourceId: c.courseId },
        { resourceType: 'exam', resourceId: c.course.examId },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}

export async function canViewerSeeInterviewCase(
  prisma: PrismaClient,
  viewer: Viewer,
  interviewCaseId: string,
): Promise<boolean> {
  if (viewer.isAdmin) {
    return true
  }
  const c = await prisma.interviewCase.findUnique({
    where: { id: interviewCaseId },
    select: {
      isPublished: true,
      interviewCourseId: true,
      interviewCourse: { select: { interviewId: true, isPublished: true } },
    },
  })
  if (!c) {
    return false
  }
  if (c.isPublished && c.interviewCourse.isPublished) {
    return true
  }
  if (viewer.userId === null) {
    return false
  }
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId: viewer.userId,
      OR: [
        { resourceType: 'interview_course', resourceId: c.interviewCourseId },
        { resourceType: 'interview', resourceId: c.interviewCourse.interviewId },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}

export function resolveViewerFromRequest(request: { isAdmin?: boolean; user?: unknown }): Viewer {
  const userId =
    request.user && typeof request.user === 'object' && 'userId' in request.user
      ? (request.user as { userId?: number }).userId ?? null
      : null
  return {
    userId: typeof userId === 'number' ? userId : null,
    isAdmin: request.isAdmin === true,
  }
}

export async function autoGrantOnCreate(
  tx: TxClient,
  args: {
    instructorId: string
    role: PermissionRole
    resourceType: PermissionResourceType
    resourceId: string
  },
): Promise<void> {
  const instructor = await tx.instructor.findUnique({
    where: { id: args.instructorId },
    select: { userId: true },
  })
  if (!instructor) {
    throw new Error('Instructor not found')
  }
  await tx.permissionGrant.upsert({
    where: {
      userId_role_resourceType_resourceId: {
        userId: instructor.userId,
        role: args.role,
        resourceType: args.resourceType,
        resourceId: args.resourceId,
      },
    },
    create: {
      userId: instructor.userId,
      role: args.role,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      grantedById: instructor.userId,
    },
    update: {},
  })
}

export async function userHasAnyGrantOnInterviewCourse(
  prisma: PrismaClient,
  userId: number,
  interviewCourseId: string,
): Promise<boolean> {
  const interviewCourse = await prisma.interviewCourse.findUnique({
    where: { id: interviewCourseId },
    select: { interviewId: true },
  })
  if (!interviewCourse) {
    return false
  }
  const grant = await prisma.permissionGrant.findFirst({
    where: {
      userId,
      OR: [
        { resourceType: 'interview_course', resourceId: interviewCourseId },
        { resourceType: 'interview', resourceId: interviewCourse.interviewId },
      ],
    },
    select: { id: true },
  })
  return grant !== null
}
