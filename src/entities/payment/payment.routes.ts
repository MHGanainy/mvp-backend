import { FastifyInstance } from 'fastify'
import { PaymentService } from './payment.service'
import { StripeCheckoutService } from './stripe-checkout.service'
import {
  paymentParamsSchema,
  createCreditCheckoutSchema,
  checkoutSessionParamSchema
} from './payment.schema'
import { requireAuth, getCurrentStudentId } from '../../middleware/auth.middleware'

export default async function paymentRoutes(fastify: FastifyInstance) {
  const paymentService = new PaymentService(fastify.prisma)
  const checkoutService = new StripeCheckoutService(fastify.prisma)

  // GET /payments/:id - Get payment details
  fastify.get('/payments/:id', {
    preHandler: requireAuth()
  }, async (request, reply) => {
    try {
      const { id } = paymentParamsSchema.parse(request.params)
      const payment = await paymentService.findById(id)

      // Check authorization - students can only see their own payments
      const user = request.user as any;
      if (user?.role === 'student' && payment.studentId !== getCurrentStudentId(request)) {
        reply.status(403).send({ error: 'Access denied' })
        return
      }

      reply.send(payment)
    } catch (error) {
      if (error instanceof Error && error.message === 'Payment not found') {
        reply.status(404).send({ error: 'Payment not found' })
      } else {
        reply.status(400).send({ error: 'Invalid request' })
      }
    }
  })

  // POST /payments/credit-checkout - Create Stripe Checkout Session for credit purchase (student only)
  fastify.post('/payments/credit-checkout', {
    preHandler: requireAuth('student'),
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)!
      const { packageId } = createCreditCheckoutSchema.parse(request.body)

      const session = await checkoutService.createCreditCheckoutSession(studentId, packageId)

      reply.status(201).send({
        message: 'Checkout session created successfully',
        ...session,
      })
    } catch (error: any) {
      fastify.log.error(error)
      if (error.message === 'Student not found') {
        reply.status(404).send({ error: error.message })
      } else if (error.message === 'Credit package not found') {
        reply.status(404).send({ error: error.message })
      } else if (error.message === 'This credit package is no longer available') {
        reply.status(400).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Failed to create checkout session' })
      }
    }
  })

  // GET /payments/checkout-status/:sessionId - Check checkout session status (authenticated)
  fastify.get('/payments/checkout-status/:sessionId', {
    preHandler: requireAuth(),
  }, async (request, reply) => {
    try {
      const { sessionId } = checkoutSessionParamSchema.parse(request.params)
      const status = await checkoutService.getCheckoutSessionStatus(sessionId)

      reply.send(status)
    } catch (error: any) {
      fastify.log.error(error)
      if (error.message === 'Checkout session not found') {
        reply.status(404).send({ error: error.message })
      } else {
        reply.status(500).send({ error: 'Failed to fetch checkout session status' })
      }
    }
  })
}