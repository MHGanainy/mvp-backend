/**
 * Backfill script for StudentCasePractice table
 *
 * This script populates the StudentCasePractice table with existing practice data
 * from completed SimulationAttempts that have AI feedback.
 *
 * Run with: npx ts-node prisma/scripts/backfill-student-case-practice.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting backfill of StudentCasePractice table...')

  // Get all completed simulation attempts with AI feedback
  const completedAttempts = await prisma.simulationAttempt.findMany({
    where: {
      isCompleted: true,
      aiFeedback: { not: Prisma.DbNull }
    },
    include: {
      simulation: {
        select: {
          courseCaseId: true
        }
      }
    },
    orderBy: {
      endedAt: 'asc'
    }
  }) as Array<{
    id: string
    studentId: string
    endedAt: Date | null
    simulation: { courseCaseId: string }
  }>

  console.log(`Found ${completedAttempts.length} completed attempts to process`)

  // Group attempts by student + courseCase
  const practiceMap = new Map<string, {
    studentId: string
    courseCaseId: string
    practiceCount: number
    firstPracticedAt: Date | null
    lastPracticedAt: Date | null
  }>()

  for (const attempt of completedAttempts) {
    const key = `${attempt.studentId}:${attempt.simulation.courseCaseId}`

    const existing = practiceMap.get(key)
    if (existing) {
      existing.practiceCount++
      if (attempt.endedAt) {
        if (!existing.firstPracticedAt || attempt.endedAt < existing.firstPracticedAt) {
          existing.firstPracticedAt = attempt.endedAt
        }
        if (!existing.lastPracticedAt || attempt.endedAt > existing.lastPracticedAt) {
          existing.lastPracticedAt = attempt.endedAt
        }
      }
    } else {
      practiceMap.set(key, {
        studentId: attempt.studentId,
        courseCaseId: attempt.simulation.courseCaseId,
        practiceCount: 1,
        firstPracticedAt: attempt.endedAt,
        lastPracticedAt: attempt.endedAt
      })
    }
  }

  console.log(`Aggregated to ${practiceMap.size} unique student-case combinations`)

  // Upsert all records
  let created = 0
  let updated = 0
  let errors = 0

  for (const [key, data] of practiceMap) {
    try {
      const result = await prisma.studentCasePractice.upsert({
        where: {
          studentId_courseCaseId: {
            studentId: data.studentId,
            courseCaseId: data.courseCaseId
          }
        },
        update: {
          isPracticed: true,
          practiceCount: data.practiceCount,
          firstPracticedAt: data.firstPracticedAt,
          lastPracticedAt: data.lastPracticedAt
        },
        create: {
          studentId: data.studentId,
          courseCaseId: data.courseCaseId,
          isPracticed: true,
          practiceCount: data.practiceCount,
          firstPracticedAt: data.firstPracticedAt,
          lastPracticedAt: data.lastPracticedAt,
          isBookmarked: false
        }
      })

      // Check if it was created or updated by checking if practiceCount matches
      const wasCreated = result.createdAt.getTime() === result.updatedAt.getTime()
      if (wasCreated) {
        created++
      } else {
        updated++
      }
    } catch (error) {
      console.error(`Error processing ${key}:`, error)
      errors++
    }
  }

  console.log('\nBackfill complete!')
  console.log(`  Created: ${created}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Errors: ${errors}`)
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
