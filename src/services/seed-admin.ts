// src/services/seed-admin.ts
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'simsbuddy'
  
  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail }
    })
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists:', adminEmail)
      
      // Ensure the existing user is marked as admin
      if (!existingAdmin.isAdmin) {
        await prisma.user.update({
          where: { id: existingAdmin.id },
          data: { isAdmin: true }
        })
        console.log('✅ Updated existing user to admin status')
      }
      
      // Check if instructor and student profiles exist
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
        console.log('✅ Created missing instructor profile for admin')
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
        console.log('✅ Created missing student profile for admin')
      }
      
      return existingAdmin
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 12)
    
    // Create admin user - only use fields that exist in the User model
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashedPassword,
        name: 'System Administrator',  // Using 'name' instead of firstName/lastName
        isAdmin: true,
        emailVerified: true  // Mark as verified
      }
    })
    
    // Create instructor profile
    const instructor = await prisma.instructor.create({
      data: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        bio: 'System administrator with full access'
        // Removed rating and totalReviews as they don't exist
      }
    })
    
    // Create student profile
    const student = await prisma.student.create({
      data: {
        userId: adminUser.id,
        firstName: 'System',
        lastName: 'Administrator',
        creditBalance: 999999 // Virtually unlimited credits
      }
    })
    
    console.log('✅ Admin user created successfully!')
    console.log('   Email:', adminEmail)
    console.log('   Password:', adminPassword)
    console.log('   User ID:', adminUser.id)
    console.log('   Instructor ID:', instructor.id)
    console.log('   Student ID:', student.id)
    
    return adminUser
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    
    // If it's a unique constraint error, it might mean partial data exists
    if ((error as any).code === 'P2002') {
      console.log('⚠️  Partial admin data may exist. Attempting to find user...')
      
      // Try to find the user
      const user = await prisma.user.findUnique({
        where: { email: adminEmail }
      })
      
      if (user) {
        console.log('✅ Found existing user, marking as admin')
        return await prisma.user.update({
          where: { id: user.id },
          data: { isAdmin: true }
        })
      }
    }
    
    throw error
  }
}

// Only run directly if this is the main module
if (require.main === module) {
  seedAdminUser()
    .then(() => {
      console.log('✅ Admin seeding completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Admin seeding failed:', error)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

export default seedAdminUser