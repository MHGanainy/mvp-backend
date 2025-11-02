// src/services/cleanup.service.ts
import { PrismaClient } from '@prisma/client'

export class CleanupService {
  constructor(private prisma: PrismaClient) {}

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

    console.log(`🧹 Cleaned up ${result.count} expired pending registrations`)
    return result.count
  }

  /**
   * Delete pending registrations with expired OTPs
   */
  async cleanupExpiredOTPs(): Promise<number> {
    const now = new Date()

    const result = await this.prisma.pendingRegistration.deleteMany({
      where: {
        otpExpiresAt: {
          lt: now
        }
      }
    })

    console.log(`🧹 Cleaned up ${result.count} pending registrations with expired OTPs`)
    return result.count
  }
}

