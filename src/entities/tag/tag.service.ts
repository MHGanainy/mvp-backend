import { PrismaClient } from '@prisma/client'
import { generateUniqueSlug } from '../../shared/slug'
import { CreateTagInput } from './tag.schema'

export class TagService {
  constructor(private prisma: PrismaClient) {}

  async findAll() {
    const tags = await this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { articleTags: true } } },
    })

    return tags.map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      name: tag.name,
      description: tag.description,
      articleCount: tag._count.articleTags,
    }))
  }

  async create(data: CreateTagInput) {
    const slug = data.slug || await generateUniqueSlug(data.name, async (testSlug) => {
      const existing = await this.prisma.tag.findUnique({ where: { slug: testSlug } })
      return existing !== null
    })

    return await this.prisma.tag.create({
      data: { name: data.name, slug, description: data.description },
    })
  }

  async update(id: string, data: Partial<CreateTagInput>) {
    const existing = await this.prisma.tag.findUnique({ where: { id } })
    if (!existing) throw new Error('Tag not found')

    return await this.prisma.tag.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    })
  }

  async delete(id: string) {
    const existing = await this.prisma.tag.findUnique({
      where: { id },
      include: { _count: { select: { articleTags: true } } },
    })
    if (!existing) throw new Error('Tag not found')
    if (existing._count.articleTags > 0) {
      throw new Error('Tag is in use by articles and cannot be deleted')
    }
    await this.prisma.tag.delete({ where: { id } })
  }
}
