/**
 * Backfill script for StudentInterviewPractice table
 *
 * This script populates the StudentInterviewPractice table with existing practice data
 * from completed InterviewSimulationAttempts that have AI feedback.
 *
 * Run with: npx ts-node prisma/scripts/backfill-student-interview-practice.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting backfill of StudentInterviewPractice table...')

  // Get all completed interview simulation attempts with AI feedback
  const completedAttempts = await prisma.interviewSimulationAttempt.findMany({
    where: {
      isCompleted: true,
      aiFeedback: { not: Prisma.DbNull }
    },
    include: {
      interviewSimulation: {
        select: {
          interviewCaseId: true
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
    interviewSimulation: { interviewCaseId: string }
  }>

  console.log(`Found ${completedAttempts.length} completed attempts to process`)

  // Group attempts by student + interviewCase
  const practiceMap = new Map<string, {
    studentId: string
    interviewCaseId: string
    practiceCount: number
    firstPracticedAt: Date | null
    lastPracticedAt: Date | null
  }>()

  for (const attempt of completedAttempts) {
    const key = `${attempt.studentId}:${attempt.interviewSimulation.interviewCaseId}`

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
        interviewCaseId: attempt.interviewSimulation.interviewCaseId,
        practiceCount: 1,
        firstPracticedAt: attempt.endedAt,
        lastPracticedAt: attempt.endedAt
      })
    }
  }

  console.log(`Aggregated to ${practiceMap.size} unique student-interviewCase combinations`)

  // Upsert all records
  let created = 0
  let updated = 0
  let errors = 0

  for (const [key, data] of practiceMap) {
    try {
      const result = await prisma.studentInterviewPractice.upsert({
        where: {
          studentId_interviewCaseId: {
            studentId: data.studentId,
            interviewCaseId: data.interviewCaseId
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
          interviewCaseId: data.interviewCaseId,
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
