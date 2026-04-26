import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  let examGrants = 0
  const exams = await prisma.exam.findMany({
    select: { id: true, instructor: { select: { userId: true } } },
  })
  for (const exam of exams) {
    const result = await prisma.permissionGrant.upsert({
      where: {
        userId_role_resourceType_resourceId: {
          userId: exam.instructor.userId,
          role: 'case_editor',
          resourceType: 'exam',
          resourceId: exam.id,
        },
      },
      create: {
        userId: exam.instructor.userId,
        role: 'case_editor',
        resourceType: 'exam',
        resourceId: exam.id,
        grantedById: exam.instructor.userId,
      },
      update: {},
    })
    if (result) {
      examGrants++
    }
  }

  let interviewGrants = 0
  const interviews = await prisma.interview.findMany({
    select: { id: true, instructor: { select: { userId: true } } },
  })
  for (const interview of interviews) {
    const result = await prisma.permissionGrant.upsert({
      where: {
        userId_role_resourceType_resourceId: {
          userId: interview.instructor.userId,
          role: 'case_editor',
          resourceType: 'interview',
          resourceId: interview.id,
        },
      },
      create: {
        userId: interview.instructor.userId,
        role: 'case_editor',
        resourceType: 'interview',
        resourceId: interview.id,
        grantedById: interview.instructor.userId,
      },
      update: {},
    })
    if (result) {
      interviewGrants++
    }
  }

  console.log(`Backfilled grants: ${examGrants} exams, ${interviewGrants} interviews`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
