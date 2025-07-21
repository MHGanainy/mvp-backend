import { FastifyInstance } from 'fastify'
import { PaymentService } from './payment.service'
import { 
  initiatePaymentSchema, 
  confirmPaymentSchema,
  paymentParamsSchema 
} from './payment.schema'
import { requireAuth, getCurrentStudentId } from '../../middleware/auth.middleware'

export default async function paymentRoutes(fastify: FastifyInstance) {
  const paymentService = new PaymentService(fastify.prisma)

  // POST /payments/initiate - Initiate a payment (student only)
  fastify.post('/payments/initiate', {
    preHandler: requireAuth('student')
  }, async (request, reply) => {
    try {
      const studentId = getCurrentStudentId(request)!
      const data = initiatePaymentSchema.parse(request.body)
      
      // Ensure student is initiating payment for themselves
      if (data.studentId !== studentId) {
        reply.status(403).send({ error: 'You can only initiate payments for yourself' })
        return
      }
      
      const paymentSession = await paymentService.initiatePayment(data)
      
      reply.status(200).send({
        message: 'Payment initiated successfully',
        ...paymentSession
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Student not found') {
          reply.status(404).send({ error: 'Student not found' })
        } else if (error.message === 'Course not found') {
          reply.status(404).send({ error: 'Course not found' })
        } else if (error.message === 'Course is not published') {
          reply.status(400).send({ error: 'Course is not published' })
        } else if (error.message === 'Active subscription already exists') {
          reply.status(400).send({ error: 'You already have an active subscription to this course' })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

  // POST /payments/confirm - Confirm a payment (mock Stripe webhook)
  fastify.post('/payments/confirm', async (request, reply) => {
    try {
      const data = confirmPaymentSchema.parse(request.body)
      const payment = await paymentService.confirmPayment(data)
      
      reply.send({
        message: 'Payment confirmed successfully',
        payment
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Payment not found') {
          reply.status(404).send({ error: 'Payment not found' })
        } else if (error.message === 'Payment is not in pending status') {
          reply.status(400).send({ error: 'Payment is not in pending status' })
        } else if (error.message === 'Invalid payment intent ID') {
          reply.status(400).send({ error: 'Invalid payment intent ID' })
        } else {
          reply.status(400).send({ error: error.message })
        }
      } else {
        reply.status(500).send({ error: 'Internal server error' })
      }
    }
  })

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

  // GET /payments/mock-checkout - Mock Stripe checkout page (for testing)
  fastify.get('/payments/mock-checkout', async (request, reply) => {
    const { payment_intent } = request.query as { payment_intent: string }
    
    if (!payment_intent) {
      reply.status(400).send({ error: 'Missing payment_intent parameter' })
      return
    }
    
    // In real implementation, this would redirect to Stripe
    // For mock, we'll return a simple HTML form
    reply.type('text/html').send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mock Stripe Checkout</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; }
          input { width: 100%; padding: 8px; }
          button { background: #5469d4; color: white; padding: 10px 20px; border: none; cursor: pointer; }
          button:hover { background: #4259c3; }
        </style>
      </head>
      <body>
        <h2>Mock Stripe Payment</h2>
        <p>Payment Intent: ${payment_intent}</p>
        <form id="paymentForm">
          <div class="form-group">
            <label>Card Number</label>
            <input type="text" value="4242 4242 4242 4242" readonly>
          </div>
          <div class="form-group">
            <label>Expiry</label>
            <input type="text" value="12/25" readonly>
          </div>
          <div class="form-group">
            <label>CVC</label>
            <input type="text" value="123" readonly>
          </div>
          <button type="submit">Complete Payment</button>
        </form>
        <script>
          document.getElementById('paymentForm').onsubmit = async (e) => {
            e.preventDefault();
            alert('Payment completed! This is a mock payment.');
            // In real implementation, this would handle Stripe payment
            // and redirect back to your application
            window.close();
          };
        </script>
      </body>
      </html>
    `)
  })
}