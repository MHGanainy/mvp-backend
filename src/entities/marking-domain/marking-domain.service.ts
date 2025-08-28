import { PrismaClient } from '@prisma/client'
import { CreateMarkingDomainInput, UpdateMarkingDomainInput } from './marking-domain.schema'

export class MarkingDomainService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateMarkingDomainInput) {
    // Check if a marking domain with this name already exists
    const existing = await this.prisma.markingDomain.findFirst({
      where: { 
        name: {
          equals: data.name,
          mode: 'insensitive'
        }
      }
    })

    if (existing) {
      throw new Error('Marking domain with this name already exists')
    }

    return await this.prisma.markingDomain.create({
      data: {
        name: data.name
      },
      include: {
        markingCriteria: true
      }
    })
  }

  async findAll() {
    return await this.prisma.markingDomain.findMany({
      include: {
        markingCriteria: {
          select: {
            id: true,
            courseCaseId: true,
            text: true,
            points: true,
            displayOrder: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })
  }

  async findById(id: string) {
    const markingDomain = await this.prisma.markingDomain.findUnique({
      where: { id },
      include: {
        markingCriteria: {
          select: {
            id: true,
            courseCaseId: true,
            text: true,
            points: true,
            displayOrder: true,
            createdAt: true
          },
          orderBy: {
            displayOrder: 'asc'
          }
        }
      }
    })

    if (!markingDomain) {
      throw new Error('MarkingDomain not found')
    }

    return markingDomain
  }

  async update(id: string, data: UpdateMarkingDomainInput) {
    // Check if exists first
    await this.findById(id)

    // If updating name, check for duplicates
    if (data.name) {
      const existing = await this.prisma.markingDomain.findFirst({
        where: { 
          name: {
            equals: data.name,
            mode: 'insensitive'
          },
          id: { not: id }
        }
      })

      if (existing) {
        throw new Error('Marking domain with this name already exists')
      }
    }

    return await this.prisma.markingDomain.update({
      where: { id },
      data,
      include: {
        markingCriteria: true
      }
    })
  }

  async delete(id: string) {
    // Check if exists first
    await this.findById(id)

    // Check if this domain has any marking criteria
    const criteriaCount = await this.prisma.markingCriterion.count({
      where: { markingDomainId: id }
    })

    if (criteriaCount > 0) {
      throw new Error(`Cannot delete marking domain: ${criteriaCount} marking criteria are still using this domain`)
    }

    // Check if this domain is assigned to any exams
    const examCount = await this.prisma.examMarkingDomain.count({
      where: { markingDomainId: id }
    })

    if (examCount > 0) {
      throw new Error(`Cannot delete marking domain: ${examCount} exams are still using this domain`)
    }

    return await this.prisma.markingDomain.delete({
      where: { id }
    })
  }

  // Get all marking criteria for a specific domain
  async getMarkingCriteria(id: string) {
    // Verify domain exists
    await this.findById(id)

    return await this.prisma.markingCriterion.findMany({
      where: { markingDomainId: id },
      include: {
        courseCase: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: {
              select: {
                id: true,
                title: true,
                examId: true,
                exam: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { courseCase: { displayOrder: 'asc' } },
        { displayOrder: 'asc' }
      ]
    })
  }

  // Get usage statistics for a marking domain
  async getUsageStats(id: string) {
    const markingDomain = await this.findById(id)

    // Get all marking criteria grouped by course case
    const criteria = await this.prisma.markingCriterion.findMany({
      where: { markingDomainId: id },
      include: {
        courseCase: {
          select: {
            id: true,
            title: true
          }
        }
      }
    })

    // Group by course case
    const caseBreakdown = criteria.reduce((acc, criterion) => {
      const caseId = criterion.courseCase.id
      const existing = acc.find(c => c.courseCaseId === caseId)
      
      if (existing) {
        existing.criteriaCount++
        existing.totalPoints += criterion.points
      } else {
        acc.push({
          courseCaseId: caseId,
          courseCaseTitle: criterion.courseCase.title,
          criteriaCount: 1,
          totalPoints: criterion.points
        })
      }
      
      return acc
    }, [] as Array<{
      courseCaseId: string
      courseCaseTitle: string
      criteriaCount: number
      totalPoints: number
    }>)

    return {
      id: markingDomain.id,
      name: markingDomain.name,
      totalCriteria: criteria.length,
      totalCases: caseBreakdown.length,
      totalPoints: criteria.reduce((sum, c) => sum + c.points, 0),
      caseBreakdown
    }
  }
}