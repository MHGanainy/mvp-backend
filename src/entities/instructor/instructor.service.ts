import { PrismaClient, Prisma } from '@prisma/client'
import { CreateInstructorInput, UpdateInstructorInput } from './instructor.schema'

export class InstructorService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateInstructorInput) {
    // Create User and Instructor in a transaction
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First, create the User
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name
        }
      })

      // Then, create the Instructor linked to the User
      const instructor = await tx.instructor.create({
        data: {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          bio: data.bio
        },
        include: {
          user: true
        }
      })

      return instructor
    })
  }

  async findAll() {
    return await this.prisma.instructor.findMany({
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  async findById(id: string) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { id },
      include: {
        user: true
      }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    return instructor
  }

  async findByUserId(userId: number) {
    const instructor = await this.prisma.instructor.findUnique({
      where: { userId },
      include: {
        user: true
      }
    })

    if (!instructor) {
      throw new Error('Instructor not found')
    }

    return instructor
  }

  async update(id: string, data: UpdateInstructorInput) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.instructor.update({
      where: { id },
      data,
      include: {
        user: true
      }
    })
  }

  async delete(id: string) {
    // Check if exists first
    const instructor = await this.findById(id)

    // Delete in transaction (Instructor first, then User)
    return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.instructor.delete({
        where: { id }
      })

      await tx.user.delete({
        where: { id: instructor.userId }
      })
    })
  }
}