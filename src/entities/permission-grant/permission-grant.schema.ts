import { z } from 'zod'

export const PermissionRoleEnum = z.enum(['case_collaborator', 'case_editor'])
export const PermissionResourceTypeEnum = z.enum(['exam', 'course', 'interview', 'interview_course'])

export const createPermissionGrantSchema = z.object({
  userId: z.number().int().positive(),
  role: PermissionRoleEnum,
  resourceType: PermissionResourceTypeEnum,
  resourceId: z.string().uuid(),
})

export const permissionGrantParamsSchema = z.object({
  id: z.string().uuid(),
})

export const listPermissionGrantsQuerySchema = z
  .object({
    userId: z.coerce.number().int().positive().optional(),
    resourceType: PermissionResourceTypeEnum.optional(),
    resourceId: z.string().uuid().optional(),
  })
  .refine(
    (q) => q.userId !== undefined || (q.resourceType !== undefined && q.resourceId !== undefined),
    { message: 'Provide either userId, or both resourceType and resourceId' },
  )

export type CreatePermissionGrantInput = z.infer<typeof createPermissionGrantSchema>
export type ListPermissionGrantsQuery = z.infer<typeof listPermissionGrantsQuerySchema>
