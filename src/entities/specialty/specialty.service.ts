import { PrismaClient } from '@prisma/client'
import { CreateSpecialtyInput, UpdateSpecialtyInput } from './specialty.schema'

export class SpecialtyService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateSpecialtyInput) {
    return await this.prisma.specialty.create({
      data: {
        name: data.name
      }
    })
  }

  async findAll() {
    return await this.prisma.specialty.findMany({
      orderBy: {
        name: 'asc'
      }
    })
  }

  async findById(id: string) {
    const specialty = await this.prisma.specialty.findUnique({
      where: { id }
    })

    if (!specialty) {
      throw new Error('Specialty not found')
    }

    return specialty
  }

  async update(id: string, data: UpdateSpecialtyInput) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.specialty.update({
      where: { id },
      data
    })
  }

  async delete(id: string) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.specialty.delete({
      where: { id }
    })
  }
}