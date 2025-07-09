import { PrismaClient } from '@prisma/client'
import { CreateMarkingDomainInput, UpdateMarkingDomainInput } from './marking-domain.schema'

export class MarkingDomainService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateMarkingDomainInput) {
    return await this.prisma.markingDomain.create({
      data: {
        name: data.name
      }
    })
  }

  async findAll() {
    return await this.prisma.markingDomain.findMany({
      orderBy: {
        name: 'asc'
      }
    })
  }

  async findById(id: string) {
    const markingDomain = await this.prisma.markingDomain.findUnique({
      where: { id }
    })

    if (!markingDomain) {
      throw new Error('MarkingDomain not found')
    }

    return markingDomain
  }

  async update(id: string, data: UpdateMarkingDomainInput) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.markingDomain.update({
      where: { id },
      data
    })
  }

  async delete(id: string) {
    // Check if exists first
    await this.findById(id)

    return await this.prisma.markingDomain.delete({
      where: { id }
    })
  }
}