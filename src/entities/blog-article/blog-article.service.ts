import { PrismaClient } from '@prisma/client'
import { generateUniqueSlug } from '../../shared/slug'
import { sanitizeArticleHtml } from '../../shared/html-sanitizer'
import { getWordCount, getReadingTime } from '../../shared/blog-utils'
import { BlogArticlesQuery, CreateBlogArticleInput, UpdateBlogArticleInput } from './blog-article.schema'

export class BlogArticleService {
  constructor(private prisma: PrismaClient) {}

  // ─── Public Read Methods ────────────────────────────────────

  async findAllPublished(query: BlogArticlesQuery) {
    const { page, limit, sort, order, category, tag, search, status } = query
    const skip = (page - 1) * limit

    const andConditions: any[] = status ? [{ status }] : []

    if (category) {
      andConditions.push({
        articleCategories: { some: { category: { slug: category } } },
      })
    }
    if (tag) {
      andConditions.push({
        articleTags: { some: { tag: { slug: tag } } },
      })
    }
    if (search && search.trim()) {
      const term = search.trim()
      andConditions.push({
        OR: [
          { headline: { contains: term, mode: 'insensitive' } },
          { excerpt: { contains: term, mode: 'insensitive' } },
          { content: { contains: term, mode: 'insensitive' } },
        ],
      })
    }

    const where = { AND: andConditions }

    const orderByMap: Record<string, any> = {
      published_date: { publishedDate: order },
      updated_date: { updatedDate: order },
      view_count: { viewCount: order },
    }

    const [total, articles] = await Promise.all([
      this.prisma.blogArticle.count({ where }),
      this.prisma.blogArticle.findMany({
        where,
        select: this.getListSelect(),
        orderBy: orderByMap[sort] || { publishedDate: 'desc' },
        skip,
        take: limit,
      }),
    ])

    const totalPages = Math.ceil(total / limit)

    return {
      data: articles.map(this.formatListArticle),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  async findBySlug(slug: string) {
    const article = await this.prisma.blogArticle.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, name: true, email: true } },
        articleCategories: {
          include: { category: true },
          orderBy: { isPrimary: 'desc' },
        },
        articleTags: { include: { tag: true } },
        faqs: { orderBy: { position: 'asc' } },
        relatedFrom: {
          include: {
            relatedArticle: {
              select: {
                id: true,
                slug: true,
                headline: true,
                excerpt: true,
                featuredImageUrl: true,
                featuredImageAlt: true,
                blurDataUrl: true,
                readingTimeMinutes: true,
                articleCategories: {
                  where: { isPrimary: true },
                  select: { category: { select: { slug: true, name: true } } },
                },
              },
            },
          },
          orderBy: { relevanceScore: 'desc' },
          take: 5,
        },
      },
    })
    if (!article) throw new Error('Article not found')

    // Inline view count increment (non-critical, don't fail the read)
    try {
      await this.prisma.blogArticle.update({
        where: { id: article.id },
        data: { viewCount: { increment: 1 } },
      })
    } catch (err) {
      console.error('Failed to increment view count', err)
    }

    // Format response
    const primaryCat = article.articleCategories.find((ac) => ac.isPrimary)
    const secondaryCats = article.articleCategories.filter((ac) => !ac.isPrimary)

    return {
      ...article,
      primaryCategory: primaryCat?.category || null,
      secondaryCategories: secondaryCats.map((ac) => ac.category),
      tags: article.articleTags.map((at) => at.tag),
      faqs: article.faqs,
      relatedArticles: article.relatedFrom.map((r) => ({
        ...r.relatedArticle,
        primaryCategory:
          (r.relatedArticle as any).articleCategories?.[0]?.category || null,
      })),
      // Remove raw join tables from response
      articleCategories: undefined,
      articleTags: undefined,
      relatedFrom: undefined,
    }
  }

  async findTopArticles(limit: number) {
    const articles = await this.prisma.blogArticle.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        slug: true,
        articleCategories: {
          where: { isPrimary: true },
          select: { category: { select: { slug: true } } },
        },
      },
      orderBy: { viewCount: 'desc' },
      take: limit,
    })

    return articles.map((a) => ({
      slug: a.slug,
      primaryCategory: a.articleCategories[0]?.category || null,
    }))
  }

  // ─── Admin Write Methods ────────────────────────────────────

  async create(data: CreateBlogArticleInput, authorId: number) {
    const sanitizedContent = sanitizeArticleHtml(data.content)
    const wordCount = getWordCount(sanitizedContent)
    const readingTime = getReadingTime(wordCount)

    const slug = data.slug || await generateUniqueSlug(data.headline, async (testSlug) => {
      const existing = await this.prisma.blogArticle.findUnique({ where: { slug: testSlug } })
      return existing !== null
    })

    return await this.prisma.$transaction(async (tx) => {
      const article = await tx.blogArticle.create({
        data: {
          slug,
          headline: data.headline,
          subheadline: data.subheadline,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          content: sanitizedContent,
          excerpt: data.excerpt,
          tldr: data.tldr,
          authorId,
          status: data.status,
          publishedDate: data.status === 'PUBLISHED' ? new Date() : null,
          wordCount,
          readingTimeMinutes: readingTime,
          featuredImageUrl: data.featuredImageUrl,
          featuredImageAlt: data.featuredImageAlt,
          featuredImageCaption: data.featuredImageCaption,
          blurDataUrl: data.blurDataUrl,
        },
      })

      // Primary category
      await tx.articleCategory.create({
        data: { articleId: article.id, categoryId: data.primaryCategoryId, isPrimary: true },
      })

      // Secondary categories
      if (data.secondaryCategoryIds.length > 0) {
        await tx.articleCategory.createMany({
          data: data.secondaryCategoryIds.map((catId) => ({
            articleId: article.id,
            categoryId: catId,
            isPrimary: false,
          })),
        })
      }

      // Tags
      if (data.tagIds.length > 0) {
        await tx.articleTag.createMany({
          data: data.tagIds.map((tagId) => ({
            articleId: article.id,
            tagId,
          })),
        })
      }

      // FAQs
      if (data.faqs.length > 0) {
        await tx.articleFaq.createMany({
          data: data.faqs.map((faq) => ({
            articleId: article.id,
            question: faq.question,
            answer: faq.answer,
            position: faq.position,
          })),
        })
      }

      return article
    })
  }

  async update(id: string, data: UpdateBlogArticleInput) {
    const existing = await this.prisma.blogArticle.findUnique({ where: { id } })
    if (!existing) throw new Error('Article not found')

    const updateData: any = {}

    if (data.content !== undefined) {
      updateData.content = sanitizeArticleHtml(data.content)
      updateData.wordCount = getWordCount(updateData.content)
      updateData.readingTimeMinutes = getReadingTime(updateData.wordCount)
    }

    if (data.headline !== undefined) updateData.headline = data.headline
    if (data.subheadline !== undefined) updateData.subheadline = data.subheadline
    if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription
    if (data.metaKeywords !== undefined) updateData.metaKeywords = data.metaKeywords
    if (data.excerpt !== undefined) updateData.excerpt = data.excerpt
    if (data.tldr !== undefined) updateData.tldr = data.tldr
    if (data.featuredImageUrl !== undefined) updateData.featuredImageUrl = data.featuredImageUrl
    if (data.featuredImageAlt !== undefined) updateData.featuredImageAlt = data.featuredImageAlt
    if (data.featuredImageCaption !== undefined) updateData.featuredImageCaption = data.featuredImageCaption
    if (data.blurDataUrl !== undefined) updateData.blurDataUrl = data.blurDataUrl

    // Status transitions
    if (data.status !== undefined) {
      updateData.status = data.status
      if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
        if (!existing.publishedDate) {
          updateData.publishedDate = new Date()
        }
      }
    }

    // Set updatedDate if article is published
    if (existing.status === 'PUBLISHED' || data.status === 'PUBLISHED') {
      updateData.updatedDate = new Date()
    }

    // Slug update
    if (data.slug !== undefined && data.slug !== existing.slug) {
      updateData.slug = data.slug
    } else if (data.headline !== undefined && !data.slug) {
      updateData.slug = await generateUniqueSlug(data.headline, async (testSlug) => {
        if (testSlug === existing.slug) return false
        const found = await this.prisma.blogArticle.findUnique({ where: { slug: testSlug } })
        return found !== null
      })
    }

    return await this.prisma.$transaction(async (tx) => {
      const article = await tx.blogArticle.update({ where: { id }, data: updateData })

      // Replace categories if provided
      if (data.primaryCategoryId !== undefined) {
        await tx.articleCategory.deleteMany({ where: { articleId: id } })
        await tx.articleCategory.create({
          data: { articleId: id, categoryId: data.primaryCategoryId, isPrimary: true },
        })
        if (data.secondaryCategoryIds && data.secondaryCategoryIds.length > 0) {
          await tx.articleCategory.createMany({
            data: data.secondaryCategoryIds.map((catId) => ({
              articleId: id,
              categoryId: catId,
              isPrimary: false,
            })),
          })
        }
      }

      // Replace tags if provided
      if (data.tagIds !== undefined) {
        await tx.articleTag.deleteMany({ where: { articleId: id } })
        if (data.tagIds.length > 0) {
          await tx.articleTag.createMany({
            data: data.tagIds.map((tagId) => ({ articleId: id, tagId })),
          })
        }
      }

      // Replace FAQs if provided
      if (data.faqs !== undefined) {
        await tx.articleFaq.deleteMany({ where: { articleId: id } })
        if (data.faqs.length > 0) {
          await tx.articleFaq.createMany({
            data: data.faqs.map((faq) => ({
              articleId: id,
              question: faq.question,
              answer: faq.answer,
              position: faq.position,
            })),
          })
        }
      }

      return article
    })
  }

  async delete(id: string) {
    const article = await this.prisma.blogArticle.findUnique({ where: { id } })
    if (!article) throw new Error('Article not found')
    await this.prisma.blogArticle.delete({ where: { id } })
  }

  async incrementViews(id: string) {
    await this.prisma.blogArticle.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    })
  }

  // ─── Private Helpers ────────────────────────────────────────

  private getListSelect() {
    return {
      id: true,
      slug: true,
      headline: true,
      excerpt: true,
      status: true,
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

  private formatListArticle(article: any) {
    return {
      id: article.id,
      slug: article.slug,
      headline: article.headline,
      excerpt: article.excerpt,
      status: article.status,
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
