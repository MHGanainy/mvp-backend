import { PrismaClient } from '@prisma/client'
import { CreateExamInput, UpdateExamInput } from './exam.schema'

export class ExamService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateExamInput) {
    // First, verify the instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: data.instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    // Check if slug already exists
    const existingExam = await this.prisma.exam.findUnique({
      where: { slug: data.slug }
    })

    if (existingExam) {
      throw new Error('Exam with this slug already exists')
    }

    return await this.prisma.exam.create({
      data: {
        instructorId: data.instructorId,
        title: data.title,
        slug: data.slug,
        description: data.description,
        isActive: data.isActive ?? true
      },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
  }

  async findAll() {
    return await this.prisma.exam.findMany({
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findActive() {
    return await this.prisma.exam.findMany({
      where: { isActive: true },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        title: 'asc'
      }
    })
  }

  async findById(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return exam
  }

  async findBySlug(slug: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { slug },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })

    if (!exam) {
      throw new Error('Exam not found')
    }

    return exam
  }

  async findByInstructor(instructorId: string) {
    // Verify instructor exists
    const instructor = await this.prisma.instructor.findUnique({
      where: { id: instructorId }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    return await this.prisma.exam.findMany({
      where: { instructorId },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async update(id: string, data: UpdateExamInput) {
    // Check if exam exists
    await this.findById(id)

    // If updating slug, check it's unique
    if (data.slug) {
      const existingExam = await this.prisma.exam.findUnique({
        where: { slug: data.slug }
      })

      if (existingExam && existingExam.id !== id) {
        throw new Error('Exam with this slug already exists')
      }
    }

    return await this.prisma.exam.update({
      where: { id },
      data,
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
  }

  async delete(id: string) {
    // Check if exam exists
    await this.findById(id)

    return await this.prisma.exam.delete({
      where: { id }
    })
  }

  async toggleActive(id: string) {
    const exam = await this.findById(id)
    
    return await this.prisma.exam.update({
      where: { id },
      data: { isActive: !exam.isActive },
      include: {
        instructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            bio: true
          }
        }
      }
    })
  }
}