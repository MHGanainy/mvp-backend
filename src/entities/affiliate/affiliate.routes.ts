import { FastifyInstance } from 'fastify'
import { AffiliateService } from './affiliate.service'
import {
  createAffiliateSchema,
  updateAffiliateSchema,
  affiliateParamsSchema,
  referralListQuerySchema,
  affiliatePortalSchema,
  affiliatePortalQuerySchema,
} from './affiliate.schema'
import { authenticate, isAdmin } from '../../middleware/auth.middleware'
import { replyInternalError } from '../../shared/route-error'

export default async function affiliateRoutes(fastify: FastifyInstance) {
  const affiliateService = new AffiliateService(fastify.prisma)

  fastify.post('/affiliates/me', async (request, reply) => {
    try {
      const { email, code } = affiliatePortalSchema.parse(request.body)
      const { page, limit } = affiliatePortalQuerySchema.parse(request.query)

      const affiliate = await fastify.prisma.affiliate.findUnique({ where: { code } })

      if (
        !affiliate ||
        !affiliate.isActive ||
        !affiliate.email ||
        affiliate.email.toLowerCase() !== email.toLowerCase()
      ) {
        reply.status(401).send({ error: 'Invalid code or email' })
        return
      }

      const result = await affiliateService.getAffiliateReferralDetails(code, page, limit)
      reply.send(result)
    } catch (error) {
      replyInternalError(request, reply, error, 'Failed to fetch affiliate portal data')
    }
  })

  // POST /affiliates
  fastify.post('/affiliates', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const data = createAffiliateSchema.parse(request.body)
      const affiliate = await affiliateService.create(data)
      reply.status(201).send(affiliate)
    } catch (error) {
      fastify.log.error({ action: 'create_affiliate', error })
      if (error instanceof Error) {
        if (error.message === 'Affiliate code already exists') {
          reply.status(409).send({ error: error.message })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /affiliates
  fastify.get('/affiliates', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const affiliates = await affiliateService.listWithStats()
      reply.send(affiliates)
    } catch (error) {
      fastify.log.error({ action: 'list_affiliates', error })
      reply.status(500).send({ error: 'Internal server error' })
    }
  })

  // GET /referrals
  fastify.get('/referrals', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const { page, limit, affiliateCode } = referralListQuerySchema.parse(request.query)
      const result = await affiliateService.listAllReferrals(page, limit, affiliateCode)
      reply.send(result)
    } catch (error) {
      fastify.log.error({ action: 'list_referrals', error })
      reply.status(500).send({ error: 'Internal server error' })
    }
  })

  // GET /affiliates/:code/referrals
  fastify.get('/affiliates/:code/referrals', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const { code } = affiliateParamsSchema.parse(request.params)
      const { page, limit } = referralListQuerySchema.parse(request.query)
      const result = await affiliateService.getAffiliateReferralDetails(code, page, limit)
      reply.send(result)
    } catch (error) {
      fastify.log.error({ action: 'get_affiliate_referrals', params: request.params, error })
      if (error instanceof Error && error.message === 'Affiliate not found') {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // GET /affiliates/:code
  fastify.get('/affiliates/:code', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const { code } = affiliateParamsSchema.parse(request.params)
      const affiliate = await affiliateService.findByCode(code)
      reply.send(affiliate)
    } catch (error) {
      fastify.log.error({ action: 'get_affiliate', params: request.params, error })
      if (error instanceof Error && error.message === 'Affiliate not found') {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // PATCH /affiliates/:code
  fastify.patch('/affiliates/:code', { preHandler: authenticate }, async (request, reply) => {
    if (!isAdmin(request)) {
      reply.status(403).send({ error: 'Admin access required' })
      return
    }
    try {
      const { code } = affiliateParamsSchema.parse(request.params)
      const data = updateAffiliateSchema.parse(request.body)
      const affiliate = await affiliateService.update(code, data)
      reply.send(affiliate)
    } catch (error) {
      fastify.log.error({ action: 'update_affiliate', params: request.params, error })
      if (error instanceof Error && error.message === 'Affiliate not found') {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(500).send({ error: error instanceof Error ? error.message : 'Internal server error' })
      }
    }
  })

}
