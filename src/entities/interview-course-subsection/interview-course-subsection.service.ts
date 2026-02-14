import { PrismaClient } from '@prisma/client'
import {
  CreateInterviewCourseSubsectionInput,
  UpdateInterviewCourseSubsectionInput
} from './interview-course-subsection.schema'

export class InterviewCourseSubsectionService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInterviewCourseSubsectionInput) {
    // Verify section exists
    const section = await this.prisma.interviewCourseSection.findUnique({
      where: { id: data.sectionId },
      include: { interviewCourse: true }
    })

    if (!section) {
      throw new Error('Section not found')
    }

    // Auto-assign display order if not provided
    let displayOrder = data.displayOrder
    if (!displayOrder) {
      const maxOrder = await this.prisma.interviewCourseSubsection.aggregate({
        where: { sectionId: data.sectionId },
        _max: { displayOrder: true }
      })
      displayOrder = (maxOrder._max.displayOrder || 0) + 1
    }

    return await this.prisma.interviewCourseSubsection.create({
      data: {
        sectionId: data.sectionId,
        title: data.title,
        description: data.description,
        contentType: data.contentType,
        content: data.content,
        displayOrder,
        estimatedDuration: data.estimatedDuration
      },
      include: {
        section: {
          select: { id: true, title: true, interviewCourseId: true }
        }
      }
    })
  }

  async findById(id: string) {
    const subsection = await this.prisma.interviewCourseSubsection.findUnique({
      where: { id },
      include: {
        section: {
          include: {
            interviewCourse: {
              select: { id: true, title: true, instructorId: true }
            }
          }
        }
      }
    })

    if (!subsection) {
      throw new Error('Subsection not found')
    }

    return subsection
  }

  async findBySection(sectionId: string) {
    const section = await this.prisma.interviewCourseSection.findUnique({
      where: { id: sectionId }
    })

    if (!section) {
      throw new Error('Section not found')
    }

    return await this.prisma.interviewCourseSubsection.findMany({
      where: { sectionId },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async update(id: string, data: UpdateInterviewCourseSubsectionInput) {
    await this.findById(id) // Verify exists

    return await this.prisma.interviewCourseSubsection.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        contentType: data.contentType,
        content: data.content,
        displayOrder: data.displayOrder,
        estimatedDuration: data.estimatedDuration
      },
      include: {
        section: {
          select: { id: true, title: true, interviewCourseId: true }
        }
      }
    })
  }

  async delete(id: string) {
    const subsection = await this.findById(id)

    await this.prisma.interviewCourseSubsection.delete({
      where: { id }
    })

    return { success: true, deletedSubsection: subsection }
  }

  async reorderSubsections(sectionId: string, subsectionIds: string[]) {
    const subsections = await this.prisma.interviewCourseSubsection.findMany({
      where: { sectionId }
    })

    const existingIds = subsections.map(s => s.id)
    const allExist = subsectionIds.every(id => existingIds.includes(id))

    if (!allExist || subsectionIds.length !== existingIds.length) {
      throw new Error('Invalid subsection IDs for reordering')
    }

    await this.prisma.$transaction(
      subsectionIds.map((id, index) =>
        this.prisma.interviewCourseSubsection.update({
          where: { id },
          data: { displayOrder: index + 1 }
        })
      )
    )

    return await this.findBySection(sectionId)
  }
}
