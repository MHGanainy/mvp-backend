import { PrismaClient } from '@prisma/client'
import { FastifyBaseLogger } from 'fastify'

export class CleanupService {
  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {}

    /**
   * Delete pending registrations older than 24 hours
   * Run this periodically (e.g., daily via cron job)
   */
  async cleanupExpiredPendingRegistrations(): Promise<number> {
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    const result = await this.prisma.pendingRegistration.deleteMany({
      where: {
        createdAt: {
          lt: oneDayAgo
        }
      }
    })

    this.log.info({ count: result.count }, 'Cleaned up expired pending registrations')
    return result.count
  }

  async cleanupExpiredOTPs(): Promise<number> {
    const now = new Date()

    const result = await this.prisma.pendingRegistration.deleteMany({
      where: {
        otpExpiresAt: {
          lt: now
        }
      }
    })

    this.log.info({ count: result.count }, 'Cleaned up pending registrations with expired OTPs')
    return result.count
  }
}
