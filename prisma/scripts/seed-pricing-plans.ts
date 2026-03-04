/**
 * Seed script for PricingPlan table
 *
 * Populates PricingPlan records from existing Course and InterviewCourse
 * pricing fields (price3Months, price6Months, price12Months + credits).
 *
 * Run with: npx ts-node prisma/scripts/seed-pricing-plans.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting seed of PricingPlan table...')

  let created = 0
  let skipped = 0
  let errors = 0

  // --- Seed from Courses ---
  const courses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      price3Months: true,
      price6Months: true,
      price12Months: true,
      credits3Months: true,
      credits6Months: true,
      credits12Months: true,
    },
  })

  console.log(`Found ${courses.length} courses to process`)

  for (const course of courses) {
    const tiers = [
      {
        name: '3 Month Access',
        durationMonths: 3,
        price: course.price3Months,
        credits: course.credits3Months,
        displayOrder: 1,
        isPopular: false,
      },
      {
        name: '6 Month Access',
        durationMonths: 6,
        price: course.price6Months,
        credits: course.credits6Months,
        displayOrder: 2,
        isPopular: true,
      },
      {
        name: '12 Month Access',
        durationMonths: 12,
        price: course.price12Months,
        credits: course.credits12Months,
        displayOrder: 3,
        isPopular: false,
      },
    ]

    for (const tier of tiers) {
      try {
        const priceInCents = Math.round(Number(tier.price) * 100)

        // Check if plan already exists for this resource + displayOrder
        const existing = await prisma.pricingPlan.findFirst({
          where: {
            resourceType: 'COURSE',
            resourceId: course.id,
            displayOrder: tier.displayOrder,
          },
        })

        if (existing) {
          skipped++
          continue
        }

        await prisma.pricingPlan.create({
          data: {
            resourceType: 'COURSE',
            resourceId: course.id,
            name: tier.name,
            durationMonths: tier.durationMonths,
            priceInCents,
            creditsIncluded: tier.credits || null,
            displayOrder: tier.displayOrder,
            isPopular: tier.isPopular,
            isActive: true,
          },
        })
        created++
      } catch (error) {
        console.error(`Error creating plan for course "${course.title}" (${tier.name}):`, error)
        errors++
      }
    }
  }

  // --- Seed from InterviewCourses ---
  const interviewCourses = await prisma.interviewCourse.findMany({
    select: {
      id: true,
      title: true,
      price3Months: true,
      price6Months: true,
      price12Months: true,
      credits3Months: true,
      credits6Months: true,
      credits12Months: true,
    },
  })

  console.log(`Found ${interviewCourses.length} interview courses to process`)

  for (const ic of interviewCourses) {
    const tiers = [
      {
        name: '3 Month Access',
        durationMonths: 3,
        price: ic.price3Months,
        credits: ic.credits3Months,
        displayOrder: 1,
        isPopular: false,
      },
      {
        name: '6 Month Access',
        durationMonths: 6,
        price: ic.price6Months,
        credits: ic.credits6Months,
        displayOrder: 2,
        isPopular: true,
      },
      {
        name: '12 Month Access',
        durationMonths: 12,
        price: ic.price12Months,
        credits: ic.credits12Months,
        displayOrder: 3,
        isPopular: false,
      },
    ]

    for (const tier of tiers) {
      try {
        const priceInCents = Math.round(Number(tier.price) * 100)

        const existing = await prisma.pricingPlan.findFirst({
          where: {
            resourceType: 'INTERVIEW_COURSE',
            resourceId: ic.id,
            displayOrder: tier.displayOrder,
          },
        })

        if (existing) {
          skipped++
          continue
        }

        await prisma.pricingPlan.create({
          data: {
            resourceType: 'INTERVIEW_COURSE',
            resourceId: ic.id,
            name: tier.name,
            durationMonths: tier.durationMonths,
            priceInCents,
            creditsIncluded: tier.credits || null,
            displayOrder: tier.displayOrder,
            isPopular: tier.isPopular,
            isActive: true,
          },
        })
        created++
      } catch (error) {
        console.error(`Error creating plan for interview course "${ic.title}" (${tier.name}):`, error)
        errors++
      }
    }
  }

  console.log('\nSeed complete!')
  console.log(`  Created: ${created}`)
  console.log(`  Skipped (already exist): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
