import { PrismaClient } from '@prisma/client'
import { generateUniqueSlug } from '../../shared/slug'
import { CreateBlogCategoryInput, UpdateBlogCategoryInput } from './blog-category.schema'

export class BlogCategoryService {
  constructor(private prisma: PrismaClient) {}

  async findAll(includeInactive = false) {
    const categories = await this.prisma.blogCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { displayOrder: 'asc' },
    })

    // Compute articleCount per category (published articles where category is primary)
    const counts = await this.prisma.articleCategory.groupBy({
      by: ['categoryId'],
      where: {
        isPrimary: true,
        article: { status: 'PUBLISHED' },
      },
      _count: { articleId: true },
    })
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count.articleId]))

    return categories.map((cat) => ({
      ...cat,
      articleCount: countMap.get(cat.id) || 0,
    }))
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.blogCategory.findUnique({ where: { slug } })
    if (!category) throw new Error('Category not found')
    return category
  }

  async findArticlesByCategory(
    slug: string,
    options: { page: number; limit: number; sort: string; order: 'asc' | 'desc' }
  ) {
    const category = await this.findBySlug(slug)
    const skip = (options.page - 1) * options.limit

    const sortOrder = options.order as 'asc' | 'desc'
    const orderBy = options.sort === 'view_count'
      ? { viewCount: sortOrder }
      : { publishedDate: sortOrder }

    const where = {
      status: 'PUBLISHED' as const,
      articleCategories: { some: { categoryId: category.id } },
    }

    const [total, articles] = await Promise.all([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        select: this.getListSelect(),
        orderBy,
        skip,
        take: options.limit,
      }),
    ])

    const totalPages = Math.ceil(total / options.limit)

    return {
      category,
      data: articles.map(this.formatListArticle),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        totalPages,
        hasNextPage: options.page < totalPages,
        hasPreviousPage: options.page > 1,
      },
    }
  }

  async create(data: CreateBlogCategoryInput) {
    const slug = data.slug || await generateUniqueSlug(data.name, async (testSlug) => {
      const existing = await this.prisma.blogCategory.findUnique({ where: { slug: testSlug } })
      return existing !== null
    })

    return await this.prisma.blogCategory.create({
      data: { ...data, slug },
    })
  }

  async update(id: string, data: UpdateBlogCategoryInput) {
    const existing = await this.prisma.blogCategory.findUnique({ where: { id } })
    if (!existing) throw new Error('Category not found')
    return await this.prisma.blogCategory.update({ where: { id }, data })
  }

  async delete(id: string) {
    const existing = await this.prisma.blogCategory.findUnique({ where: { id } })
    if (!existing) throw new Error('Category not found')

    // Prevent deletion if articles use this as primary category
    const primaryCount = await this.prisma.articleCategory.count({
      where: { categoryId: id, isPrimary: true },
    })
    if (primaryCount > 0) {
      throw new Error('Cannot delete category: articles use it as primary category')
    }

    await this.prisma.blogCategory.delete({ where: { id } })
  }

  /** Select fields for article listings — no full content */
  private getListSelect() {
    return {
      id: true,
      slug: true,
      headline: true,
      excerpt: true,
      featuredImageUrl: true,
      featuredImageAlt: true,
      blurDataUrl: true,
      publishedDate: true,
      updatedDate: true,
      readingTimeMinutes: true,
      wordCount: true,
      viewCount: true,
      author: {
        select: { id: true, name: true, email: true },
      },
      articleCategories: {
        where: { isPrimary: true },
        select: { category: { select: { slug: true, name: true } } },
      },
      articleTags: {
        select: { tag: { select: { slug: true, name: true } } },
      },
    } as const
  }

  /** Transform Prisma result into the API response shape */
  private formatListArticle(article: any) {
    return {
      id: article.id,
      slug: article.slug,
      headline: article.headline,
      excerpt: article.excerpt,
      featuredImage: {
        url: article.featuredImageUrl,
        alt: article.featuredImageAlt,
        blurDataUrl: article.blurDataUrl,
      },
      publishedDate: article.publishedDate,
      updatedDate: article.updatedDate,
      readingTimeMinutes: article.readingTimeMinutes,
      wordCount: article.wordCount,
      viewCount: article.viewCount,
      author: article.author,
      primaryCategory: article.articleCategories[0]?.category || null,
      tags: article.articleTags.map((at: any) => at.tag),
    }
  }
}
