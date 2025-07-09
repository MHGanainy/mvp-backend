import { PrismaClient } from '@prisma/client'
import { CreateCurriculumInput, UpdateCurriculumInput } from './curriculum.schema'

export class CurriculumService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCurriculumInput) {
    return await this.prisma.curriculum.create({
      data: {
        name: data.name
      }
    })
  }

  async findAll() {
    return await this.prisma.curriculum.findMany({
      orderBy: {
        name: 'asc'
      }
    })
  }

  async findById(id: string) {
    const curriculum = await this.prisma.curriculum.findUnique({
      where: { id }
    })

    if (!curriculum) {
      throw new Error('Curriculum not found')
    }

    return curriculum
  }

  async update(id: string, data: UpdateCurriculumInput) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.curriculum.update({
      where: { id },
      data
    })
  }

  async delete(id: string) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.curriculum.delete({
      where: { id }
    })
  }
}