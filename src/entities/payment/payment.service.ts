import { PrismaClient, PaymentStatus, PaymentType } from '@prisma/client'
import { InitiatePaymentInput, ConfirmPaymentInput } from './payment.schema'

export class PaymentService {
  constructor(private prisma: PrismaClient) {}

  // Initiate a payment (creates pending payment record)
  async initiatePayment(data: InitiatePaymentInput) {
    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: data.studentId }
    })

    if (!student) {
      throw new Error('Student not found')
    }

    // Verify course exists and get pricing
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId }
    })

    if (!course) {
      throw new Error('Course not found')
    }

    if (!course.isPublished) {
      throw new Error('Course is not published')
    }

    // Check if student already has active subscription
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        studentId: data.studentId,
        courseId: data.courseId,
        endDate: { gte: new Date() }
      }
    })

    if (existingSubscription) {
      throw new Error('Active subscription already exists')
    }

    // Get pricing based on duration
    const amount = this.getSubscriptionPrice(course, data.durationMonths)
    
    // Generate mock Stripe payment intent ID
    const mockStripePaymentId = `pi_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create pending payment
    const payment = await this.prisma.payment.create({
      data: {
        studentId: data.studentId,
        stripePaymentId: mockStripePaymentId,
        amount,
        currency: 'USD',
        paymentType: PaymentType.SUBSCRIPTION,
        paymentStatus: PaymentStatus.PENDING,
        courseId: data.courseId,
        subscriptionDuration: data.durationMonths
      }
    })

    // Return payment info with mock Stripe session
    return {
      paymentId: payment.id,
      stripePaymentIntentId: mockStripePaymentId,
      amount: payment.amount,
      currency: payment.currency,
      // Mock Stripe checkout URL
      checkoutUrl: `/mock-stripe-checkout?payment_intent=${mockStripePaymentId}`
    }
  }

  // Confirm a payment (mock Stripe webhook)
  async confirmPayment(data: ConfirmPaymentInput) {
    // Find the pending payment
    const payment = await this.prisma.payment.findUnique({
      where: { id: data.paymentId }
    })

    if (!payment) {
      throw new Error('Payment not found')
    }

    if (payment.paymentStatus !== PaymentStatus.PENDING) {
      throw new Error('Payment is not in pending status')
    }

    if (payment.stripePaymentId !== data.stripePaymentIntentId) {
      throw new Error('Invalid payment intent ID')
    }

    // Update payment to completed
    const updatedPayment = await this.prisma.payment.update({
      where: { id: data.paymentId },
      data: {
        paymentStatus: PaymentStatus.COMPLETED
      }
    })

    return updatedPayment
  }

  // Get payment by ID
  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    })

    if (!payment) {
      throw new Error('Payment not found')
    }

    return payment
  }

  // Helper method to get subscription price
  private getSubscriptionPrice(course: any, durationMonths: number): number {
    switch (durationMonths) {
      case 3:
        return Number(course.price3Months)
      case 6:
        return Number(course.price6Months)
      case 12:
        return Number(course.price12Months)
      default:
        throw new Error('Invalid subscription duration')
    }
  }
}