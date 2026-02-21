import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import pino from 'pino'

const prisma = new PrismaClient()
const log = pino({ level: process.env.LOG_LEVEL || 'info' })

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'simsbuddy'

  try {
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    })

    if (existingAdmin) {
      log.info({ email: adminEmail }, 'Admin user already exists')

      if (!existingAdmin.isAdmin) {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: { isAdmin: true }
        })
        log.info('Updated existing user to admin status')
      }

      const instructor = await prisma.instructor.findUnique({
        where: { userId: existingAdmin.id }
      })

      const student = await prisma.student.findUnique({
        where: { userId: existingAdmin.id }
      })

      if (!instructor) {
        await prisma.instructor.create({
          data: {
            userId: existingAdmin.id,
            firstName: 'System',
            lastName: 'Administrator',
            bio: 'System administrator with full access'
          }
        })
        log.info('Created missing instructor profile for admin')
      }

      if (!student) {
        await prisma.student.create({
          data: {
            userId: existingAdmin.id,
            firstName: 'System',
            lastName: 'Administrator',
            creditBalance: 999999
          }
        })
        log.info('Created missing student profile for admin')
      }

      return existingAdmin
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12)

    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashedPassword,
        name: 'System Administrator',
        isAdmin: true,
        emailVerified: true
      }
    })

    const instructor = await prisma.instructor.create({
      data: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        bio: 'System administrator with full access'
      }
    })

    const student = await prisma.student.create({
      data: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        creditBalance: 999999
      }
    })

    log.info({
      email: adminEmail,
      userId: adminUser.id,
      instructorId: instructor.id,
      studentId: student.id,
    }, 'Admin user created successfully')

    return adminUser
  } catch (error) {
    log.error({ err: error }, 'Error creating admin user')

    if ((error as { code?: string }).code === 'P2002') {
      log.warn('Partial admin data may exist, attempting to find user')

      const user = await prisma.user.findUnique({
        where: { email: adminEmail }
      })

      if (user) {
        log.info({ userId: user.id }, 'Found existing user, marking as admin')
        return await prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: true }
        })
      }
    }

    throw error
  }
}

if (require.main === module) {
  seedAdminUser()
    .then(() => {
      log.info('Admin seeding completed')
      process.exit(0)
    })
    .catch((error) => {
      log.error({ err: error }, 'Admin seeding failed')
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

export default seedAdminUser
