import { PrismaClient } from '@prisma/client'
import { CreateAffiliateInput, UpdateAffiliateInput } from './affiliate.schema'

export class AffiliateService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateAffiliateInput) {
    const existing = await this.prisma.affiliate.findUnique({
      where: { code: data.code },
    })
    if (existing) {
      throw new Error('Affiliate code already exists')
    }
    return this.prisma.affiliate.create({ data })
  }

  async findByCode(code: string) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code },
    })
    if (!affiliate) {
      throw new Error('Affiliate not found')
    }
    return affiliate
  }

  async list() {
    return this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  async update(code: string, data: UpdateAffiliateInput) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code },
    })
    if (!affiliate) {
      throw new Error('Affiliate not found')
    }
    return this.prisma.affiliate.update({
      where: { code },
      data,
    })
  }

  async getReferralsByAffiliate(code: string, page: number, limit: number) {
    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code },
    })
    if (!affiliate) {
      throw new Error('Affiliate not found')
    }

    const [referrals, total] = await Promise.all([
      this.prisma.referral.findMany({
        where: { affiliateId: affiliate.id },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({
        where: { affiliateId: affiliate.id },
      }),
    ])

    return { affiliate, referrals, total, page, limit }
  }

  async listAllReferrals(page: number, limit: number, affiliateCode?: string) {
    const where = affiliateCode
      ? { code: affiliateCode }
      : {}

    const [referrals, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        include: {
          affiliate: { select: { name: true, code: true } },
          user: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where }),
    ])

    return { referrals, total, page, limit }
  }
}
