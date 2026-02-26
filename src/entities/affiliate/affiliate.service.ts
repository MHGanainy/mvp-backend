import { PrismaClient, PaymentStatus, Prisma } from '@prisma/client'
import { CreateAffiliateInput, UpdateAffiliateInput } from './affiliate.schema'

export class AffiliateService {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateAffiliateInput) {
    const code = data.code ?? (await this.generateUniqueCode())
    try {
      return await this.prisma.affiliate.create({ data: { ...data, code } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Affiliate code already exists')
      }
      throw error
    }
  }

  private async generateUniqueCode(): Promise<string> {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz'
    for (let i = 0; i < 5; i++) {
      const code = Array.from(
        { length: 4 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('')
      const exists = await this.prisma.affiliate.findUnique({ where: { code } })
      if (!exists) {
        return code
      }
    }
    throw new Error('Failed to generate unique affiliate code')
  }

  async findByCode(code: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } })
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

  async listWithStats() {
    const affiliates = await this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        referrals: {
          include: {
            user: {
              select: {
                student: {
                  select: {
                    payments: {
                      where: { paymentStatus: PaymentStatus.COMPLETED },
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    return affiliates.map(affiliate => {
      const totalReferrals = affiliate.referrals.length
      const convertedReferrals = affiliate.referrals.filter(
        r => (r.user?.student?.payments?.length ?? 0) > 0
      ).length
      return {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        code: affiliate.code,
        isActive: affiliate.isActive,
        createdAt: affiliate.createdAt,
        updatedAt: affiliate.updatedAt,
        totalReferrals,
        convertedReferrals,
        pendingReferrals: totalReferrals - convertedReferrals,
      }
    })
  }

  async update(code: string, data: UpdateAffiliateInput) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } })
    if (!affiliate) {
      throw new Error('Affiliate not found')
    }
    return this.prisma.affiliate.update({ where: { code }, data })
  }

  async getAffiliateReferralDetails(code: string, page: number, limit: number) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } })
    if (!affiliate) {
      throw new Error('Affiliate not found')
    }

    const [referrals, total, convertedCount] = await Promise.all([
      this.prisma.referral.findMany({
        where: { affiliateId: affiliate.id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              student: {
                select: {
                  payments: {
                    where: { paymentStatus: PaymentStatus.COMPLETED },
                    select: { createdAt: true, amount: true },
                    orderBy: { createdAt: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where: { affiliateId: affiliate.id } }),
      this.prisma.referral.count({
        where: {
          affiliateId: affiliate.id,
          user: {
            student: {
              payments: {
                some: { paymentStatus: PaymentStatus.COMPLETED },
              },
            },
          },
        },
      }),
    ])

    const referralDetails = referrals.map(r => {
      const payments = r.user?.student?.payments ?? []
      const hasPaid = payments.length > 0
      return {
        id: r.id,
        createdAt: r.createdAt,
        user: { id: r.user?.id ?? 0, email: r.user?.email ?? '', name: r.user?.name ?? null },
        hasPaid,
        firstPaymentDate: hasPaid ? payments[0].createdAt : null,
        totalPaid: hasPaid ? payments.reduce((sum, p) => sum + Number(p.amount), 0) : 0,
      }
    })

    return {
      affiliate: {
        ...affiliate,
        totalReferrals: total,
        convertedReferrals: convertedCount,
        pendingReferrals: total - convertedCount,
      },
      referrals: referralDetails,
      total,
      page,
      limit,
    }
  }

  async getReferralsByAffiliate(code: string, page: number, limit: number) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code } })
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
