import { PrismaClient } from '@prisma/client'
import {
  CreateInterviewCourseSectionInput,
  CreateInterviewCourseSectionCompleteInput,
  UpdateInterviewCourseSectionInput
} from './interview-course-section.schema'

export class InterviewCourseSectionService {
  constructor(private prisma: PrismaClient) {}

  // ============================================
  // CREATE METHODS
  // ============================================

  async create(data: CreateInterviewCourseSectionInput) {
    // Verify interview course exists and is STRUCTURED style
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: data.interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    if (interviewCourse.style !== 'STRUCTURED') {
      throw new Error('Sections can only be added to STRUCTURED style interview courses')
    }

    // Auto-assign display order if not provided
    let displayOrder = data.displayOrder
    if (!displayOrder) {
      const maxOrder = await this.prisma.interviewCourseSection.aggregate({
        where: { interviewCourseId: data.interviewCourseId },
        _max: { displayOrder: true }
      })
      displayOrder = (maxOrder._max.displayOrder || 0) + 1
    } else {
      // Check if display order is already taken
      const existing = await this.prisma.interviewCourseSection.findFirst({
        where: { interviewCourseId: data.interviewCourseId, displayOrder }
      })
      if (existing) {
        throw new Error(`Display order ${displayOrder} is already taken`)
      }
    }

    return await this.prisma.interviewCourseSection.create({
      data: {
        interviewCourseId: data.interviewCourseId,
        title: data.title,
        description: data.description,
        displayOrder,
        isFree: data.isFree ?? false
      },
      include: {
        interviewCourse: {
          select: { id: true, title: true, style: true }
        },
        subsections: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    })
  }

  async createComplete(data: CreateInterviewCourseSectionCompleteInput) {
    // Verify interview course exists and is STRUCTURED style
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: data.interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    if (interviewCourse.style !== 'STRUCTURED') {
      throw new Error('Sections can only be added to STRUCTURED style interview courses')
    }

    return await this.prisma.$transaction(async (tx) => {
      // Auto-assign section display order
      let sectionDisplayOrder = data.displayOrder
      if (!sectionDisplayOrder) {
        const maxOrder = await tx.interviewCourseSection.aggregate({
          where: { interviewCourseId: data.interviewCourseId },
          _max: { displayOrder: true }
        })
        sectionDisplayOrder = (maxOrder._max.displayOrder || 0) + 1
      }

      // Create section
      const section = await tx.interviewCourseSection.create({
        data: {
          interviewCourseId: data.interviewCourseId,
          title: data.title,
          description: data.description,
          displayOrder: sectionDisplayOrder,
          isFree: data.isFree ?? false
        }
      })

      // Create subsections
      // If section is locked (isFree=false), all subsections must also be locked
      const sectionIsFree = data.isFree ?? false
      const createdSubsections = []
      if (data.subsections && data.subsections.length > 0) {
        for (let i = 0; i < data.subsections.length; i++) {
          const sub = data.subsections[i]
          const subsection = await tx.interviewCourseSubsection.create({
            data: {
              sectionId: section.id,
              title: sub.title,
              description: sub.description,
              contentType: sub.contentType,
              content: sub.content,
              displayOrder: sub.displayOrder || (i + 1),
              estimatedDuration: sub.estimatedDuration,
              // If section is locked, subsection must be locked too
              isFree: sectionIsFree ? (sub.isFree ?? false) : false
            }
          })
          createdSubsections.push(subsection)
        }
      }

      return {
        section,
        subsections: createdSubsections,
        summary: {
          sectionCreated: true,
          subsectionsCreated: createdSubsections.length
        }
      }
    })
  }

  // ============================================
  // READ METHODS
  // ============================================

  async findById(id: string, includeSubsections: boolean = true) {
    const section = await this.prisma.interviewCourseSection.findUnique({
      where: { id },
      include: {
        interviewCourse: {
          select: { id: true, title: true, style: true, instructorId: true }
        },
        subsections: includeSubsections ? {
          orderBy: { displayOrder: 'asc' }
        } : false
      }
    })

    if (!section) {
      throw new Error('Section not found')
    }

    return section
  }

  async findByInterviewCourse(interviewCourseId: string, includeSubsections: boolean = true) {
    // Verify interview course exists
    const interviewCourse = await this.prisma.interviewCourse.findUnique({
      where: { id: interviewCourseId }
    })

    if (!interviewCourse) {
      throw new Error('Interview course not found')
    }

    return await this.prisma.interviewCourseSection.findMany({
      where: { interviewCourseId },
      include: {
        subsections: includeSubsections ? {
          orderBy: { displayOrder: 'asc' }
        } : false
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findAll() {
    return await this.prisma.interviewCourseSection.findMany({
      include: {
        interviewCourse: {
          select: { id: true, title: true, style: true }
        },
        subsections: {
          orderBy: { displayOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  // ============================================
  // UPDATE METHODS
  // ============================================

  async update(id: string, data: UpdateInterviewCourseSectionInput) {
    const section = await this.findById(id)

    // Check display order conflict if updating
    if (data.displayOrder && data.displayOrder !== section.displayOrder) {
      const existing = await this.prisma.interviewCourseSection.findFirst({
        where: {
          interviewCourseId: section.interviewCourseId,
          displayOrder: data.displayOrder,
          NOT: { id }
        }
      })
      if (existing) {
        throw new Error(`Display order ${data.displayOrder} is already taken`)
      }
    }

    return await this.prisma.interviewCourseSection.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        displayOrder: data.displayOrder,
        isFree: data.isFree
      },
      include: {
        interviewCourse: {
          select: { id: true, title: true, style: true }
        },
        subsections: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    })
  }

  // ============================================
  // DELETE METHODS
  // ============================================

  async delete(id: string) {
    const section = await this.findById(id)

    await this.prisma.interviewCourseSection.delete({
      where: { id }
    })

    return { success: true, deletedSection: section }
  }

  // ============================================
  // REORDER METHODS
  // ============================================

  async reorderSections(interviewCourseId: string, sectionIds: string[]) {
    // Verify all sections belong to the interview course
    const sections = await this.prisma.interviewCourseSection.findMany({
      where: { interviewCourseId }
    })

    const existingIds = sections.map(s => s.id)
    const allExist = sectionIds.every(id => existingIds.includes(id))

    if (!allExist || sectionIds.length !== existingIds.length) {
      throw new Error('Invalid section IDs for reordering')
    }

    // Update display orders in transaction
    await this.prisma.$transaction(
      sectionIds.map((id, index) =>
        this.prisma.interviewCourseSection.update({
          where: { id },
          data: { displayOrder: index + 1 }
        })
      )
    )

    return await this.findByInterviewCourse(interviewCourseId)
  }
}
