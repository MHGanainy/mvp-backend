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
}
