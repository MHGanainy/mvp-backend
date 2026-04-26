import { PermissionResourceType, PrismaClient } from '@prisma/client'
import { CreatePermissionGrantInput } from './permission-grant.schema'

export class PermissionGrantService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreatePermissionGrantInput, grantedById: number) {
    await this.assertResourceExists(data.resourceType, data.resourceId)
    const user = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } })
    if (!user) {
      throw new Error('User not found')
    }
    return this.prisma.permissionGrant.upsert({
      where: {
        userId_role_resourceType_resourceId: {
          userId: data.userId,
          role: data.role,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
        },
      },
      create: {
        userId: data.userId,
        role: data.role,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        grantedById,
      },
      update: {},
    })
  }

  async delete(id: string) {
    const grant = await this.prisma.permissionGrant.findUnique({ where: { id } })
    if (!grant) {
      throw new Error('Permission grant not found')
    }
    await this.prisma.permissionGrant.delete({ where: { id } })
  }

  async listByResource(resourceType: PermissionResourceType, resourceId: string) {
    return this.prisma.permissionGrant.findMany({
      where: { resourceType, resourceId },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async listByUser(userId: number) {
    return this.prisma.permissionGrant.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    })
  }

  private async assertResourceExists(resourceType: PermissionResourceType, resourceId: string): Promise<void> {
    let exists = false
    if (resourceType === 'exam') {
      exists = (await this.prisma.exam.findUnique({ where: { id: resourceId }, select: { id: true } })) !== null
    } else if (resourceType === 'course') {
      exists = (await this.prisma.course.findUnique({ where: { id: resourceId }, select: { id: true } })) !== null
    } else if (resourceType === 'interview') {
      exists = (await this.prisma.interview.findUnique({ where: { id: resourceId }, select: { id: true } })) !== null
    } else if (resourceType === 'interview_course') {
      exists = (await this.prisma.interviewCourse.findUnique({ where: { id: resourceId }, select: { id: true } })) !== null
    }
    if (!exists) {
      throw new Error(`${resourceType} not found`)
    }
  }
}
