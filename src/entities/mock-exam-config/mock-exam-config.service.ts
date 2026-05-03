// mock-exam-config.service.ts
import { PrismaClient, Prisma } from '@prisma/client'
import {
  CreateMockExamConfigInput,
  UpdateMockExamConfigInput
} from './mock-exam-config.schema'

export class MockExamConfigService {
  constructor(private prisma: PrismaClient) {}

  // Detail include — stations ordered by displayOrder ASC, joined to courseCase.
  // Stage 6 (B.2.5): added course title + first specialty/curriculum joins so
  // the frontend Edit-mode form can rebuild the `selectedStations` snapshot
  // (which displays "<courseTitle> · <specialty> · <curriculum>" subtitle per
  // selected station) without N+1 per-case fetches.
  public getDetailInclude() {
    return {
      stations: {
        orderBy: { displayOrder: Prisma.SortOrder.asc },
        include: {
          courseCase: {
            select: {
              id: true,
              title: true,
              isActive: true,
              course: { select: { title: true } },
              caseSpecialties: {
                select: { specialty: { select: { name: true } } }
              },
              caseCurriculums: {
                select: { curriculum: { select: { name: true } } }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Validate stationCaseIds: all active, all under examId, no duplicates.
   * Throws Error with descriptive messages that the route layer string-matches
   * to map to HTTP status codes.
   */
  private async validateStationCaseIds(
    examId: string,
    stationCaseIds: string[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma

    // 1. Duplicate pre-check (DB also enforces, but this gives a better error than P2002)
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const id of stationCaseIds) {
      if (seen.has(id)) duplicates.push(id)
      seen.add(id)
    }
    if (duplicates.length) {
      const uniqueDups = [...new Set(duplicates)].join(', ')
      throw new Error(`Duplicate course case IDs in stationCaseIds: ${uniqueDups}`)
    }

    // 2. Resolve all cases in one query
    const cases = await client.courseCase.findMany({
      where: { id: { in: stationCaseIds } },
      select: {
        id: true,
        isActive: true,
        course: { select: { examId: true } }
      }
    })

    // 3. Missing IDs
    const foundIds = new Set(cases.map(c => c.id))
    const missing = stationCaseIds.filter(id => !foundIds.has(id))
    if (missing.length) {
      throw new Error(`Course cases not found: ${missing.join(', ')}`)
    }

    // 4. Archived cases
    const archived = cases.filter(c => !c.isActive).map(c => c.id)
    if (archived.length) {
      throw new Error(`Cannot use archived course cases: ${archived.join(', ')}`)
    }

    // 5. Wrong-exam cases
    const wrongExam = cases.filter(c => c.course.examId !== examId).map(c => c.id)
    if (wrongExam.length) {
      throw new Error(`Course cases do not belong to exam ${examId}: ${wrongExam.join(', ')}`)
    }

    // 6. Stage 6 (closes Stage 4 backend OQ): Cases without a Simulation row
    // can't actually be taken as a station — the session page will show
    // "This case has no simulation" if a student lands on one. Reject at
    // create/update time so instructors can't ship a broken mock.
    const sims = await client.simulation.findMany({
      where: { courseCaseId: { in: stationCaseIds } },
      select: { courseCaseId: true }
    })
    const casesWithSim = new Set(sims.map(s => s.courseCaseId))
    const missingSim = stationCaseIds.filter(id => !casesWithSim.has(id))
    if (missingSim.length) {
      throw new Error(`Course cases missing Simulation rows: ${missingSim.join(', ')}`)
    }
  }

  // ===== CREATE =====

  async create(input: CreateMockExamConfigInput, instructorId: string) {
    if (!instructorId) {
      throw new Error('Instructor ID is required to create a mock exam config')
    }

    return this.prisma.$transaction(async (tx) => {
      // Phase 6.C: validate instructor exists. Catches both admins targeting
      // a non-existent instructor and the (rare) race where an instructor was
      // deleted between the picker fetch and submit.
      const instructorExists = await tx.instructor.findUnique({
        where: { id: instructorId },
        select: { id: true }
      })
      if (!instructorExists) {
        throw new Error('Instructor not found')
      }

      await this.validateStationCaseIds(input.examId, input.stationCaseIds, tx)

      const config = await tx.mockExamConfig.create({
        data: {
          examId: input.examId,
          instructorId,
          title: input.title,
          description: input.description,
          difficulty: input.difficulty,
          isPublished: input.isPublished ?? false
        }
      })

      // displayOrder is 1-based to match course-case.service.ts:127 convention
      await tx.mockExamStation.createMany({
        data: input.stationCaseIds.map((courseCaseId, idx) => ({
          mockExamConfigId: config.id,
          courseCaseId,
          displayOrder: idx + 1
        }))
      })

      return tx.mockExamConfig.findUniqueOrThrow({
        where: { id: config.id },
        include: this.getDetailInclude()
      })
    })
  }

  // ===== UPDATE =====

  async update(
    id: string,
    input: UpdateMockExamConfigInput,
    requestingInstructorId: string | null,
    isAdmin: boolean
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.mockExamConfig.findUnique({ where: { id } })
      if (!existing) {
        throw new Error('Mock exam config not found')
      }
      // Stage 6 (closes Stage 2 OQ #1): allow updates against an archived
      // config IF the caller is restoring it (`isActive: true` in payload).
      // All other update paths still 404 on archived rows.
      if (!existing.isActive && input.isActive !== true) {
        throw new Error('Mock exam config not found')
      }
      if (!isAdmin && existing.instructorId !== requestingInstructorId) {
        throw new Error('Forbidden: not your mock exam config')
      }

      // Build metadata patch only for fields that were explicitly provided
      const metadataUpdate: Prisma.MockExamConfigUpdateInput = {}
      if (input.title !== undefined) metadataUpdate.title = input.title
      if (input.description !== undefined) metadataUpdate.description = input.description
      if (input.difficulty !== undefined) metadataUpdate.difficulty = input.difficulty
      if (input.isPublished !== undefined) metadataUpdate.isPublished = input.isPublished
      if (input.isActive !== undefined) metadataUpdate.isActive = input.isActive

      if (Object.keys(metadataUpdate).length) {
        await tx.mockExamConfig.update({ where: { id }, data: metadataUpdate })
      }

      // Replace station list. delete-all-then-recreate sidesteps the
      // @@unique([mockExamConfigId, displayOrder]) collision risk.
      if (input.stationCaseIds) {
        await this.validateStationCaseIds(existing.examId, input.stationCaseIds, tx)
        await tx.mockExamStation.deleteMany({ where: { mockExamConfigId: id } })
        await tx.mockExamStation.createMany({
          data: input.stationCaseIds.map((courseCaseId, idx) => ({
            mockExamConfigId: id,
            courseCaseId,
            displayOrder: idx + 1
          }))
        })
      }

      return tx.mockExamConfig.findUniqueOrThrow({
        where: { id },
        include: this.getDetailInclude()
      })
    })
  }

  // ===== TOGGLE PUBLISH =====

  async togglePublish(
    id: string,
    isPublished: boolean,
    requestingInstructorId: string | null,
    isAdmin: boolean
  ) {
    const existing = await this.prisma.mockExamConfig.findUnique({ where: { id } })
    if (!existing || !existing.isActive) {
      throw new Error('Mock exam config not found')
    }
    if (!isAdmin && existing.instructorId !== requestingInstructorId) {
      throw new Error('Forbidden: not your mock exam config')
    }

    return this.prisma.mockExamConfig.update({
      where: { id },
      data: { isPublished },
      include: this.getDetailInclude()
    })
  }

  // ===== SOFT DELETE =====
  // NEVER calls prisma.mockExamConfig.delete(). See Project Conventions.

  async softDelete(id: string, requestingInstructorId: string | null, isAdmin: boolean) {
    const existing = await this.prisma.mockExamConfig.findUnique({ where: { id } })
    if (!existing) {
      throw new Error('Mock exam config not found')
    }
    if (!isAdmin && existing.instructorId !== requestingInstructorId) {
      throw new Error('Forbidden: not your mock exam config')
    }
    if (!existing.isActive) {
      // Idempotent — already archived
      return existing
    }
    return this.prisma.mockExamConfig.update({
      where: { id },
      data: { isActive: false, isPublished: false } // unpublish on archive
    })
  }

  // ===== FIND PUBLISHED (public/student list) =====

  async findPublished(examId: string, studentId?: string) {
    // Filtered _count for attempts (Prisma 4.3+; project is on 6.11.1).
    const configs = await this.prisma.mockExamConfig.findMany({
      where: { examId, isPublished: true, isActive: true },
      include: {
        _count: {
          select: {
            stations: true,
            attempts: studentId ? { where: { studentId } } : true
          }
        }
      },
      orderBy: { createdAt: Prisma.SortOrder.desc }
    })

    return configs.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      isPublished: c.isPublished,
      isActive: c.isActive,
      stationCount: c._count.stations,
      myAttemptCount: studentId ? c._count.attempts : 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  }

  // ===== FIND MY CONFIGS (instructor's own) =====

  async findMyConfigs(examId: string, instructorId: string | null, isAdmin: boolean) {
    if (!isAdmin && !instructorId) {
      // Defensive: should be caught at route layer; return empty for safety
      return []
    }

    const configs = await this.prisma.mockExamConfig.findMany({
      where: {
        examId,
        ...(isAdmin ? {} : { instructorId: instructorId! })
      },
      include: { _count: { select: { stations: true } } },
      orderBy: { createdAt: Prisma.SortOrder.desc }
    })

    return configs.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      isPublished: c.isPublished,
      isActive: c.isActive,
      stationCount: c._count.stations,
      myAttemptCount: 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  }

  // ===== FIND ONE (instructor detail view) =====

  async findOne(id: string, requestingInstructorId: string | null, isAdmin: boolean) {
    const config = await this.prisma.mockExamConfig.findUnique({
      where: { id },
      include: this.getDetailInclude()
    })
    if (!config) {
      throw new Error('Mock exam config not found')
    }
    if (!isAdmin && config.instructorId !== requestingInstructorId) {
      // 403 (resource exists but ownership fails). Routes string-match this prefix.
      throw new Error('Forbidden: not your mock exam config')
    }
    return config
  }
}
