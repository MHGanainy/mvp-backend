import { PrismaClient } from '@prisma/client'

export class PaymentService {
  constructor(private prisma: PrismaClient) {}

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
}