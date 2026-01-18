import { PrismaClient } from '@prisma/client'
import {
  CreateCourseSectionInput,
  CreateCourseSectionCompleteInput,
  UpdateCourseSectionInput
} from './course-section.schema'

export class CourseSectionService {
  constructor(private prisma: PrismaClient) {}

  // ============================================
  // CREATE METHODS
  // ============================================

  async create(data: CreateCourseSectionInput) {
    // Verify course exists and is STRUCTURED style
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    if (course.style !== 'STRUCTURED') {
      throw new Error('Sections can only be added to STRUCTURED style courses')
    }

    // Auto-assign display order if not provided
    let displayOrder = data.displayOrder
    if (!displayOrder) {
      const maxOrder = await this.prisma.courseSection.aggregate({
        where: { courseId: data.courseId },
        _max: { displayOrder: true }
      })
      displayOrder = (maxOrder._max.displayOrder || 0) + 1
    } else {
      // Check if display order is already taken
      const existing = await this.prisma.courseSection.findFirst({
        where: { courseId: data.courseId, displayOrder }
      })
      if (existing) {
        throw new Error(`Display order ${displayOrder} is already taken`)
      }
    }

    return await this.prisma.courseSection.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        description: data.description,
        displayOrder,
        isFree: data.isFree ?? false
      },
      include: {
        course: {
          select: { id: true, title: true, style: true }
        },
        subsections: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    })
  }

  async createComplete(data: CreateCourseSectionCompleteInput) {
    // Verify course exists and is STRUCTURED style
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    if (course.style !== 'STRUCTURED') {
      throw new Error('Sections can only be added to STRUCTURED style courses')
    }

    return await this.prisma.$transaction(async (tx) => {
      // Auto-assign section display order
      let sectionDisplayOrder = data.displayOrder
      if (!sectionDisplayOrder) {
        const maxOrder = await tx.courseSection.aggregate({
          where: { courseId: data.courseId },
          _max: { displayOrder: true }
        })
        sectionDisplayOrder = (maxOrder._max.displayOrder || 0) + 1
      }

      // Create section
      const section = await tx.courseSection.create({
        data: {
          courseId: data.courseId,
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
          const subsection = await tx.courseSubsection.create({
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
    const section = await this.prisma.courseSection.findUnique({
      where: { id },
      include: {
        course: {
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

  async findByCourse(courseId: string, includeSubsections: boolean = true) {
    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    return await this.prisma.courseSection.findMany({
      where: { courseId },
      include: {
        subsections: includeSubsections ? {
          orderBy: { displayOrder: 'asc' }
        } : false
      },
      orderBy: { displayOrder: 'asc' }
    })
  }

  async findAll() {
    return await this.prisma.courseSection.findMany({
      include: {
        course: {
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

  async update(id: string, data: UpdateCourseSectionInput) {
    const section = await this.findById(id)

    // Check display order conflict if updating
    if (data.displayOrder && data.displayOrder !== section.displayOrder) {
      const existing = await this.prisma.courseSection.findFirst({
        where: {
          courseId: section.courseId,
          displayOrder: data.displayOrder,
          NOT: { id }
        }
      })
      if (existing) {
        throw new Error(`Display order ${data.displayOrder} is already taken`)
      }
    }

    return await this.prisma.courseSection.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        displayOrder: data.displayOrder,
        isFree: data.isFree
      },
      include: {
        course: {
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

    await this.prisma.courseSection.delete({
      where: { id }
    })

    return { success: true, deletedSection: section }
  }

  // ============================================
  // REORDER METHODS
  // ============================================

  async reorderSections(courseId: string, sectionIds: string[]) {
    // Verify all sections belong to the course
    const sections = await this.prisma.courseSection.findMany({
      where: { courseId }
    })

    const existingIds = sections.map(s => s.id)
    const allExist = sectionIds.every(id => existingIds.includes(id))

    if (!allExist || sectionIds.length !== existingIds.length) {
      throw new Error('Invalid section IDs for reordering')
    }

    // Update display orders in transaction
    await this.prisma.$transaction(
      sectionIds.map((id, index) =>
        this.prisma.courseSection.update({
          where: { id },
          data: { displayOrder: index + 1 }
        })
      )
    )

    return await this.findByCourse(courseId)
  }
}
