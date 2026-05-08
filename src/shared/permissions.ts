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

export type ResourceKey = { resourceType: PermissionResourceType; resourceId: string }

export async function resolveAncestors(
  prisma: PrismaClient,
  target: ResourceTarget,
): Promise<ResourceKey[]> {
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

type GrantHierarchy = {
  parentResourceType: PermissionResourceType
  childResourceType: PermissionResourceType
  fetchChildIdsForParents: (prisma: PrismaClient, parentIds: string[]) => Promise<string[]>
}

const COURSE_HIERARCHY: GrantHierarchy = {
  parentResourceType: 'exam',
  childResourceType: 'course',
  fetchChildIdsForParents: async (prisma, examIds) => {
    const courses = await prisma.course.findMany({
      where: { examId: { in: examIds } },
      select: { id: true },
    })
    return courses.map((c) => c.id)
  },
}

const INTERVIEW_HIERARCHY: GrantHierarchy = {
  parentResourceType: 'interview',
  childResourceType: 'interview_course',
  fetchChildIdsForParents: async (prisma, interviewIds) => {
    const interviewCourses = await prisma.interviewCourse.findMany({
      where: { interviewId: { in: interviewIds } },
      select: { id: true },
    })
    return interviewCourses.map((ic) => ic.id)
  },
}

async function expandViewerScope(
  prisma: PrismaClient,
  userId: number,
  hierarchy: GrantHierarchy,
): Promise<string[]> {
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId,
      resourceType: { in: [hierarchy.parentResourceType, hierarchy.childResourceType] },
    },
    select: { resourceType: true, resourceId: true },
  })
  if (grants.length === 0) {
    return []
  }
  const childIdSet = new Set<string>()
  const parentIds: string[] = []
  for (const g of grants) {
    if (g.resourceType === hierarchy.childResourceType) {
      childIdSet.add(g.resourceId)
    } else if (g.resourceType === hierarchy.parentResourceType) {
      parentIds.push(g.resourceId)
    }
  }
  if (parentIds.length > 0) {
    const childIds = await hierarchy.fetchChildIdsForParents(prisma, parentIds)
    for (const id of childIds) {
      childIdSet.add(id)
    }
  }
  return Array.from(childIdSet)
}

export async function courseCaseVisibilityFilter(
  prisma: PrismaClient,
  userId: number | null,
  isAdmin: boolean,
): Promise<Prisma.CourseCaseWhereInput> {
  if (isAdmin) {
    return {}
  }
  const publicWhere: Prisma.CourseCaseWhereInput = {
    isActive: true,
  }
  if (userId === null) {
    return publicWhere
  }
  const courseIds = await expandViewerScope(prisma, userId, COURSE_HIERARCHY)
  if (courseIds.length === 0) {
    return publicWhere
  }
  return {
    OR: [publicWhere, { courseId: { in: courseIds } }],
  }
}

export async function interviewCaseVisibilityFilter(
  prisma: PrismaClient,
  userId: number | null,
  isAdmin: boolean,
): Promise<Prisma.InterviewCaseWhereInput> {
  if (isAdmin) {
    return {}
  }
  const publicWhere: Prisma.InterviewCaseWhereInput = {
    interviewCourse: { isPublished: true },
  }
  if (userId === null) {
    return publicWhere
  }
  const interviewCourseIds = await expandViewerScope(prisma, userId, INTERVIEW_HIERARCHY)
  if (interviewCourseIds.length === 0) {
    return publicWhere
  }
  return {
    OR: [publicWhere, { interviewCourseId: { in: interviewCourseIds } }],
  }
}

export async function canViewerSeeCourseCase(
  prisma: PrismaClient,
  viewer: { userId: number | null; isAdmin: boolean },
  courseCaseId: string,
): Promise<boolean> {
  if (viewer.isAdmin) {
    return true
  }
  const c = await prisma.courseCase.findUnique({
    where: { id: courseCaseId },
    select: {
      isActive: true,
      courseId: true,
      course: { select: { examId: true } },
    },
  })
  if (!c) {
    return false
  }
  if (c.isActive) {
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
  viewer: { userId: number | null; isAdmin: boolean },
  interviewCaseId: string,
): Promise<boolean> {
  if (viewer.isAdmin) {
    return true
  }
  const c = await prisma.interviewCase.findUnique({
    where: { id: interviewCaseId },
    select: {
      interviewCourseId: true,
      interviewCourse: { select: { interviewId: true, isPublished: true } },
    },
  })
  if (!c) {
    return false
  }
  if (c.interviewCourse.isPublished) {
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

export function resolveViewerFromRequest(
  request: { isAdmin?: boolean; user?: unknown },
): { userId: number | null; isAdmin: boolean } {
  const userId =
    request.user && typeof request.user === 'object' && 'userId' in request.user
      ? (request.user as { userId?: number }).userId ?? null
      : null
  return {
    userId: typeof userId === 'number' ? userId : null,
    isAdmin: request.isAdmin === true,
  }
}

export async function getResourcesWithPermissions(
  prisma: PrismaClient,
  args: {
    userId: number
    resourceType: PermissionResourceType
    role?: PermissionRole
  },
): Promise<string[]> {
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId: args.userId,
      resourceType: args.resourceType,
      ...(args.role !== undefined && { role: args.role }),
    },
    select: { resourceId: true },
  })
  return grants.map((g) => g.resourceId)
}

export type ResourcePermissions = {
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
}

const ALL_TRUE: ResourcePermissions = { canEdit: true, canPublish: true, canDelete: true }
const ALL_FALSE: ResourcePermissions = { canEdit: false, canPublish: false, canDelete: false }

function derivePermissions(grantedPerms: ReadonlySet<Permission>): ResourcePermissions {
  return {
    canEdit: grantedPerms.has('case.edit'),
    canPublish: grantedPerms.has('case.publish'),
    canDelete: grantedPerms.has('case.delete'),
  }
}

export async function computeResourcePermissions(
  prisma: PrismaClient,
  args: { userId: number; isAdmin: boolean; target: ResourceTarget },
): Promise<ResourcePermissions> {
  if (args.isAdmin) {
    return ALL_TRUE
  }
  const ancestors = await resolveAncestors(prisma, args.target)
  if (ancestors.length === 0) {
    return ALL_FALSE
  }
  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId: args.userId,
      OR: ancestors.map((a) => ({ resourceType: a.resourceType, resourceId: a.resourceId })),
    },
    select: { role: true },
  })
  const perms = new Set<Permission>(grants.flatMap((g) => ROLE_PERMISSIONS[g.role] as Permission[]))
  return derivePermissions(perms)
}

export async function getBulkResourcePermissions(
  prisma: PrismaClient,
  args: {
    userId: number
    isAdmin: boolean
    resources: ReadonlyArray<{ id: string; ancestorKeys: ReadonlyArray<ResourceKey> }>
  },
): Promise<Map<string, ResourcePermissions>> {
  if (args.isAdmin) {
    return new Map(args.resources.map((r) => [r.id, ALL_TRUE]))
  }
  if (args.resources.length === 0) {
    return new Map()
  }

  const allKeys: ResourceKey[] = []
  const seen = new Set<string>()
  for (const r of args.resources) {
    for (const k of r.ancestorKeys) {
      const dedupeKey = `${k.resourceType}:${k.resourceId}`
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        allKeys.push(k)
      }
    }
  }

  const grants = await prisma.permissionGrant.findMany({
    where: {
      userId: args.userId,
      OR: allKeys.map((k) => ({ resourceType: k.resourceType, resourceId: k.resourceId })),
    },
    select: { resourceType: true, resourceId: true, role: true },
  })

  const grantPermsByKey = new Map<string, Set<Permission>>()
  for (const g of grants) {
    const key = `${g.resourceType}:${g.resourceId}`
    if (!grantPermsByKey.has(key)) {
      grantPermsByKey.set(key, new Set())
    }
    for (const p of ROLE_PERMISSIONS[g.role] as Permission[]) {
      grantPermsByKey.get(key)!.add(p)
    }
  }

  const result = new Map<string, ResourcePermissions>()
  for (const r of args.resources) {
    const combined = new Set<Permission>()
    for (const k of r.ancestorKeys) {
      const key = `${k.resourceType}:${k.resourceId}`
      const perms = grantPermsByKey.get(key)
      if (perms) {
        for (const p of perms) {
          combined.add(p)
        }
      }
    }
    result.set(r.id, combined.size > 0 ? derivePermissions(combined) : ALL_FALSE)
  }

  return result
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
