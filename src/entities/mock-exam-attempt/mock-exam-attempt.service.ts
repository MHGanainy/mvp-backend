// mock-exam-attempt.service.ts
//
// Phase 3: student-facing flow for taking a curated mock exam.
// Implements 4 methods: startCurated, findOne, completeSlot, finish.
//
// Notes on completeSlot's design (see Phase 3 progress entry for full rationale):
// - completeWithTranscript() does NOT throw on AI failure. It returns a row with
//   aiFeedback.analysisStatus === 'failed'. We inspect that to decide success.
// - We do NOT wrap the AI call in our outer transaction — its writes are in its
//   own implicit tx anyway. We only transact around the slot+counter pair.
// - Concurrent double-submit is caught by the @unique on
//   MockExamSlot.simulationAttemptId (Phase 1) → P2002 → idempotent return.
import { PrismaClient, Prisma } from '@prisma/client'
import { FastifyBaseLogger } from 'fastify'
import { SimulationAttemptService } from '../simulation-attempt/simulation-attempt.service'
import {
  AIFeedbackService,
  AIProvider,
  createAIFeedbackService,
  type MockExamSummaryInput,
  type MockExamSummaryStation,
  type MockExamSummaryDomainBreakdown,
  type MockExamSummaryResponse
} from '../simulation-attempt/ai-feedback.service'

// Phase 6: soft cutoff. Attempts finished before this date can't generate
// an AI summary (we don't backfill). Frontend renders a small note.
// Setting to the Phase 6 ship date so all of today's testing-finished attempts
// are eligible.
const PHASE_6_SUMMARY_CUTOFF = new Date('2026-05-03T00:00:00.000Z')

// Phase 6: minimum stations required to generate a summary. Below this,
// we return { available: false } to avoid LLM hallucination on thin data.
const MIN_STATIONS_FOR_SUMMARY = 2

// Allow tests to swap in a stub AI service without re-wiring the constructor.
let aiServiceOverride: AIFeedbackService | undefined
export function __setAIServiceOverrideForTests(svc: AIFeedbackService | undefined) {
  aiServiceOverride = svc
}

export class MockExamAttemptService {
  private simulationAttemptService: SimulationAttemptService
  private aiFeedbackService: AIFeedbackService

  constructor(private prisma: PrismaClient, private log: FastifyBaseLogger) {
    this.simulationAttemptService = new SimulationAttemptService(prisma, log)
    this.aiFeedbackService = createAIFeedbackService({
      provider: AIProvider.GROQ,
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-120b',
      log: this.log,
    })
  }

  private getAIService(): AIFeedbackService {
    return aiServiceOverride ?? this.aiFeedbackService
  }

  // ===== Detail include =====

  private getDetailInclude() {
    return {
      slots: {
        orderBy: { displayOrder: Prisma.SortOrder.asc },
        include: {
          courseCase: {
            select: {
              id: true,
              title: true,
              slug: true,
              isActive: true,
              course: { select: { slug: true, exam: { select: { slug: true } } } }
            }
          },
          simulationAttempt: { select: { id: true, score: true } }
        }
      },
      exam: { select: { id: true, slug: true, title: true } },
      mockExamConfig: { select: { id: true, title: true } }
    }
  }

  // Compute attemptNumber for a CURATED attempt. STUDENT_GENERATED returns null
  // (Phase 3 only creates CURATED, but the helper is generic).
  // Phase 6.C: id-tiebreaker matches Phase 4 `findMyAttempts`'s
  // `ROW_NUMBER OVER (ORDER BY createdAt, id)` so single-attempt and
  // list-view results stay consistent on identical-millisecond timestamps.
  private async computeAttemptNumber(
    studentId: string,
    mockExamConfigId: string | null,
    createdAt: Date,
    attemptId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number | null> {
    if (!mockExamConfigId) return null
    const client = tx ?? this.prisma
    const count = await client.mockExamAttempt.count({
      where: {
        studentId,
        mockExamConfigId,
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lte: attemptId } }
        ]
      }
    })
    return count
  }

  // Reshape Prisma row + computed attemptNumber into the public response shape.
  private formatAttempt(
    attempt: any,
    attemptNumber: number | null
  ) {
    return {
      id: attempt.id,
      title: attempt.title,
      creationType: attempt.creationType,
      attemptNumber,
      mockExamConfigId: attempt.mockExamConfigId,
      isFinished: attempt.isFinished,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      totalSlots: attempt.totalSlots,
      completedSlots: attempt.completedSlots,
      overallScore: attempt.overallScore,
      exam: attempt.exam,
      slots: (attempt.slots as any[]).map((s) => ({
        id: s.id,
        displayOrder: s.displayOrder,
        isCompleted: s.isCompleted,
        completedAt: s.completedAt,
        simulationAttemptId: s.simulationAttemptId,
        courseCase: {
          id: s.courseCase.id,
          title: s.courseCase.title,
          slug: s.courseCase.slug,
          isActive: s.courseCase.isActive,
          courseSlug: s.courseCase.course?.slug ?? null,
          examSlug: s.courseCase.course?.exam?.slug ?? null
        }
      }))
    }
  }

  // ===== startCurated =====

  async startCurated(mockExamConfigId: string, studentId: string) {
    // Load config — must be published + active
    const config = await this.prisma.mockExamConfig.findUnique({
      where: { id: mockExamConfigId },
      include: {
        stations: {
          orderBy: { displayOrder: Prisma.SortOrder.asc },
          include: { courseCase: { select: { id: true, isActive: true } } }
        }
      }
    })
    if (!config || !config.isActive || !config.isPublished) {
      throw new Error('Mock exam config not found')
    }

    // Data-integrity guard: every station's case should still be active.
    // If not, surface a 500-ish error — instructor needs to fix the config.
    const inactiveStations = config.stations.filter((s) => !s.courseCase.isActive)
    if (inactiveStations.length) {
      this.log.error(
        {
          mockExamConfigId,
          inactiveStationIds: inactiveStations.map((s) => s.id),
          inactiveCourseCaseIds: inactiveStations.map((s) => s.courseCase.id)
        },
        'Cannot start mock exam: config references archived course case(s)'
      )
      throw new Error('Mock exam config references archived course cases (data integrity)')
    }

    if (!config.stations.length) {
      throw new Error('Mock exam config has no stations')
    }

    // Create attempt + slots in a single tx so partial state can never leak.
    const created = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.mockExamAttempt.create({
        data: {
          studentId,
          examId: config.examId,
          mockExamConfigId: config.id,
          title: config.title,
          creationType: 'CURATED',
          totalSlots: config.stations.length,
          completedSlots: 0,
          isFinished: false
        }
      })

      await tx.mockExamSlot.createMany({
        data: config.stations.map((st) => ({
          mockExamAttemptId: attempt.id,
          courseCaseId: st.courseCaseId,
          displayOrder: st.displayOrder,
          isCompleted: false
        }))
      })

      return tx.mockExamAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
        include: this.getDetailInclude()
      })
    })

    const attemptNumber = await this.computeAttemptNumber(
      studentId,
      created.mockExamConfigId,
      created.createdAt,
      created.id
    )
    return this.formatAttempt(created, attemptNumber)
  }

  // ===== findOne =====

  async findOne(attemptId: string, requestingStudentId: string) {
    const attempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId },
      include: this.getDetailInclude()
    })
    // 404 covers both "not found" and "not yours" — never leak existence.
    if (!attempt || attempt.studentId !== requestingStudentId) {
      throw new Error('Mock exam attempt not found')
    }
    const attemptNumber = await this.computeAttemptNumber(
      attempt.studentId,
      attempt.mockExamConfigId,
      attempt.createdAt,
      attempt.id
    )
    return this.formatAttempt(attempt, attemptNumber)
  }

  // ===== completeSlot =====

  async completeSlot(
    attemptId: string,
    slotId: string,
    simulationAttemptId: string,
    requestingStudentId: string
  ): Promise<{
    completedSlots: number
    totalSlots: number
    alreadyCompleted: boolean
  }> {
    // ---- Pre-flight (no transaction) ----

    // 1. Load attempt + authorize
    const attempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId }
    })
    if (!attempt || attempt.studentId !== requestingStudentId) {
      throw new Error('Mock exam attempt not found')
    }

    // 2. Guard: not already finished
    if (attempt.isFinished) {
      throw new Error('Exam is already finished')
    }

    // 3. Load slot, verify belongs to attempt
    const slot = await this.prisma.mockExamSlot.findUnique({ where: { id: slotId } })
    if (!slot || slot.mockExamAttemptId !== attemptId) {
      throw new Error('Mock exam attempt not found') // hide existence
    }

    // 4. Idempotency check (early exit — saves AI call cost)
    if (slot.isCompleted) {
      return {
        completedSlots: attempt.completedSlots,
        totalSlots: attempt.totalSlots,
        alreadyCompleted: true
      }
    }

    // 5. Validate simulationAttemptId
    const simAttempt = await this.prisma.simulationAttempt.findUnique({
      where: { id: simulationAttemptId },
      include: { simulation: { select: { courseCaseId: true } } }
    })
    if (!simAttempt) {
      throw new Error('Simulation attempt not found')
    }
    if (simAttempt.studentId !== requestingStudentId) {
      throw new Error('Simulation attempt does not belong to the requesting student')
    }
    if (simAttempt.simulation.courseCaseId !== slot.courseCaseId) {
      throw new Error('Simulation attempt is for a different course case than this slot')
    }

    // 6. Correlation token lookup (mirrors simulation-attempt.routes.ts:442-460)
    if (!simAttempt.correlationToken) {
      throw new Error('No correlation token found for this attempt')
    }

    // ---- AI call (outside any tx; its writes are in its own implicit tx) ----
    const result = await this.simulationAttemptService.completeWithTranscript(
      simulationAttemptId,
      simAttempt.correlationToken
    )

    // Inspect returned status — completeWithTranscript does not throw on AI failure
    const aiFeedback = result?.aiFeedback as any
    if (aiFeedback?.analysisStatus === 'failed') {
      const errMsg = typeof aiFeedback?.error === 'string' ? aiFeedback.error : 'AI feedback generation failed'
      throw new Error(`AI feedback generation failed: ${errMsg}`)
    }

    // ---- Short tx: slot + counter ----
    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.mockExamSlot.findUnique({ where: { id: slotId } })
      if (!fresh) {
        // Should never happen — slot existed in pre-flight. Defensive.
        throw new Error('Mock exam attempt not found')
      }
      if (fresh.isCompleted) {
        // Concurrent completion — return idempotent state. Re-fetch attempt for fresh count.
        const freshAttempt = await tx.mockExamAttempt.findUniqueOrThrow({ where: { id: attemptId } })
        return {
          completedSlots: freshAttempt.completedSlots,
          totalSlots: freshAttempt.totalSlots,
          alreadyCompleted: true
        }
      }

      try {
        await tx.mockExamSlot.update({
          where: { id: slotId },
          data: {
            simulationAttemptId,
            isCompleted: true,
            completedAt: new Date()
          }
        })
        const updatedAttempt = await tx.mockExamAttempt.update({
          where: { id: attemptId },
          data: { completedSlots: { increment: 1 } }
        })
        return {
          completedSlots: updatedAttempt.completedSlots,
          totalSlots: updatedAttempt.totalSlots,
          alreadyCompleted: false
        }
      } catch (e) {
        // Concurrent completion grabbed our simulationAttemptId first.
        // The @unique on MockExamSlot.simulationAttemptId fires P2002.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const freshAttempt = await tx.mockExamAttempt.findUniqueOrThrow({ where: { id: attemptId } })
          return {
            completedSlots: freshAttempt.completedSlots,
            totalSlots: freshAttempt.totalSlots,
            alreadyCompleted: true
          }
        }
        throw e
      }
    })
  }

  // ===== finish =====

  async finish(attemptId: string, requestingStudentId: string) {
    const attempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        slots: {
          where: { isCompleted: true },
          include: { simulationAttempt: { select: { score: true } } }
        }
      }
    })
    if (!attempt || attempt.studentId !== requestingStudentId) {
      throw new Error('Mock exam attempt not found')
    }

    // Idempotency: already finished — return cached state without re-computation
    if (attempt.isFinished) {
      const completedScored = attempt.slots.filter(
        (s) => s.simulationAttempt?.score !== null && s.simulationAttempt?.score !== undefined
      ).length
      return {
        isFinished: true,
        finishedAt: attempt.finishedAt,
        overallScore: attempt.overallScore,
        completedSlots: attempt.completedSlots,
        totalSlots: attempt.totalSlots,
        completedScoredSlots: completedScored
      }
    }

    // Compute overallScore from completed slots' simulationAttempt.score
    const scoredValues: number[] = attempt.slots
      .map((s) => s.simulationAttempt?.score)
      .filter((v): v is Prisma.Decimal => v !== null && v !== undefined)
      .map((v) => Number(v.toString()))

    const overallScore =
      scoredValues.length > 0
        ? scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length
        : null

    const finishedAt = new Date()
    const updated = await this.prisma.mockExamAttempt.update({
      where: { id: attemptId },
      data: {
        isFinished: true,
        finishedAt,
        overallScore: overallScore !== null ? new Prisma.Decimal(overallScore.toFixed(2)) : null
      }
    })

    return {
      isFinished: true,
      finishedAt: updated.finishedAt,
      overallScore: updated.overallScore,
      completedSlots: updated.completedSlots,
      totalSlots: updated.totalSlots,
      completedScoredSlots: scoredValues.length
    }
  }

  // ===== Phase 4: Results =====

  /**
   * Detail include for results — adds full simulationAttempt scalars per slot
   * so the frontend's FeedbackModal has everything it needs without N+1 calls.
   */
  private getResultsInclude() {
    return {
      slots: {
        orderBy: { displayOrder: Prisma.SortOrder.asc },
        include: {
          courseCase: {
            select: {
              id: true,
              title: true,
              slug: true,
              isActive: true,
              course: { select: { slug: true, exam: { select: { slug: true } } } }
            }
          },
          simulationAttempt: {
            // Scalars the FeedbackModal consumes. No transcript here — it's huge
            // and the modal fetches lazily if needed. Add explicitly if product asks.
            select: {
              id: true,
              score: true,
              aiFeedback: true,
              durationSeconds: true,
              minutesBilled: true,
              startedAt: true,
              endedAt: true,
              isCompleted: true
            }
          }
        }
      },
      exam: { select: { id: true, slug: true, title: true } },
      mockExamConfig: { select: { id: true, title: true } }
    }
  }

  /**
   * score-based classification. Used per-slot in results.
   * Mirrors the regular case page convention: ≥70 Pass, 50-69 Borderline Pass, <50 Fail.
   */
  private classifyScore(score: number | null): string | null {
    if (score === null) return null
    if (score >= 70) return 'Pass'
    if (score >= 50) return 'Borderline Pass'
    return 'Fail'
  }

  async getResults(attemptId: string, requestingStudentId: string) {
    const attempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId },
      include: this.getResultsInclude()
    })
    if (!attempt || attempt.studentId !== requestingStudentId) {
      throw new Error('Mock exam attempt not found')
    }
    if (!attempt.isFinished) {
      throw new Error('Attempt is not finished. Call /finish first to view results.')
    }

    const attemptNumber = await this.computeAttemptNumber(
      attempt.studentId,
      attempt.mockExamConfigId,
      attempt.createdAt,
      attempt.id
    )

    // Build slot results
    const slotResults = (attempt.slots as any[]).map((s) => {
      const sa = s.simulationAttempt
      const scoreNum =
        sa?.score !== null && sa?.score !== undefined ? Number(sa.score.toString()) : null
      return {
        slotId: s.id,
        displayOrder: s.displayOrder,
        isCompleted: s.isCompleted,
        courseCase: {
          id: s.courseCase.id,
          title: s.courseCase.title,
          slug: s.courseCase.slug,
          isActive: s.courseCase.isActive,
          courseSlug: s.courseCase.course?.slug ?? null,
          examSlug: s.courseCase.course?.exam?.slug ?? null
        },
        simulationAttempt: sa, // null if slot not completed
        score: scoreNum,
        classification: this.classifyScore(scoreNum)
      }
    })

    // Summary
    const completedScoredSlots = slotResults.filter((r) => r.score !== null).length
    const passedSlots = slotResults.filter((r) => r.score !== null && (r.score as number) >= 50).length
    const failedSlots = slotResults.filter((r) => r.score !== null && (r.score as number) < 50).length
    const notAttemptedSlots = attempt.totalSlots - attempt.completedSlots

    return {
      id: attempt.id,
      title: attempt.title,
      creationType: attempt.creationType,
      attemptNumber,
      mockExamConfigId: attempt.mockExamConfigId,
      isFinished: attempt.isFinished,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      totalSlots: attempt.totalSlots,
      completedSlots: attempt.completedSlots,
      exam: attempt.exam,
      summary: {
        overallScore: attempt.overallScore,
        completedSlots: attempt.completedSlots,
        totalSlots: attempt.totalSlots,
        completedScoredSlots,
        passedSlots,
        failedSlots,
        notAttemptedSlots
      },
      slotResults,
      analysisData: attempt.analysisData ?? null
    }
  }

  // ===== Phase 4: Analysis =====

  async getAnalysis(attemptId: string, requestingStudentId: string) {
    // Phase 5.2: short-circuit on cached path BEFORE loading slots' simulationAttempt blobs.
    // Original method loaded N slots × N aiFeedback JSON blobs even when analysisData was
    // already populated. The 404/400 error strings below match the originals exactly so
    // the route layer's status mapping is unchanged.
    const cached = await this.prisma.mockExamAttempt.findFirst({
      where: { id: attemptId, studentId: requestingStudentId },
      select: { isFinished: true, analysisData: true }
    })
    if (!cached) {
      throw new Error('Mock exam attempt not found')
    }
    if (!cached.isFinished) {
      throw new Error('Attempt is not finished. Call /finish first to view analysis.')
    }
    if (cached.analysisData !== null && cached.analysisData !== undefined) {
      return cached.analysisData as any
    }

    // No cached analysis — load full slot/feedback graph and compute.
    const attempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        slots: {
          where: { isCompleted: true },
          include: { simulationAttempt: { select: { aiFeedback: true } } }
        }
      }
    })
    if (!attempt || attempt.studentId !== requestingStudentId) {
      // Defensive — should not happen given the cached-path check above succeeded.
      throw new Error('Mock exam attempt not found')
    }

    // Collect markingDomains from slots whose AI succeeded
    type DomainAcc = { name: string; achievedPoints: number; totalPoints: number }
    const acc = new Map<string, DomainAcc>()

    for (const slot of attempt.slots as any[]) {
      const fb = slot.simulationAttempt?.aiFeedback as any
      if (!fb || fb.analysisStatus === 'failed') continue
      const domains = fb.markingDomains
      if (!Array.isArray(domains)) continue
      for (const d of domains) {
        const name = d.domainName as string
        if (!name) continue
        const achieved = Number(d.achievedPoints ?? 0)
        const total = Number(d.totalPossiblePoints ?? 0)
        const cur = acc.get(name) ?? { name, achievedPoints: 0, totalPoints: 0 }
        cur.achievedPoints += achieved
        cur.totalPoints += total
        acc.set(name, cur)
      }
    }

    const domainBreakdown = Array.from(acc.values()).map((d) => {
      const percentage = d.totalPoints > 0 ? (d.achievedPoints / d.totalPoints) * 100 : 0
      const category =
        percentage >= 70 ? 'STRENGTH' : percentage >= 50 ? 'MODERATE' : 'WEAKNESS'
      return {
        domainName: d.name,
        percentage: Math.round(percentage * 10) / 10, // 1 decimal place
        category,
        achievedPoints: d.achievedPoints,
        totalPoints: d.totalPoints
      }
    })

    const strengths = domainBreakdown.filter((d) => d.category === 'STRENGTH').map((d) => d.domainName)
    const weaknesses = domainBreakdown
      .filter((d) => d.category === 'WEAKNESS')
      .map((d) => ({
        domain: d.domainName,
        recommendation: `Focus on practicing more ${d.domainName} cases. Review the marking criteria for this domain.`
      }))

    const analysisData = {
      overallScore: attempt.overallScore,
      domainBreakdown,
      strengths,
      weaknesses,
      generatedAt: new Date().toISOString()
    }

    // Persist for idempotency
    await this.prisma.mockExamAttempt.update({
      where: { id: attemptId },
      data: { analysisData: analysisData as unknown as Prisma.InputJsonValue }
    })

    return analysisData
  }

  // ===== Phase 4: My-attempts list =====

  async findMyAttempts(
    studentId: string,
    examId: string,
    limit: number,
    offset: number
  ) {
    // Total count for pagination math
    const total = await this.prisma.mockExamAttempt.count({
      where: { studentId, examId }
    })

    if (total === 0) {
      return { attempts: [], total: 0, limit, offset }
    }

    // Page query — sorted newest first per Phase 1's index (studentId, examId, createdAt DESC)
    const rows = await this.prisma.mockExamAttempt.findMany({
      where: { studentId, examId },
      orderBy: [
        { createdAt: Prisma.SortOrder.desc },
        { id: Prisma.SortOrder.desc } // tiebreaker — matches ROW_NUMBER ORDER BY createdAt, id
      ],
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        creationType: true,
        isFinished: true,
        totalSlots: true,
        completedSlots: true,
        overallScore: true,
        startedAt: true,
        finishedAt: true,
        mockExamConfigId: true,
        createdAt: true,
        // Phase 5.1: surface parent-config metadata for the My Past Attempts list.
        // Null for STUDENT_GENERATED (no parent) or if the FK row is gone (defensive).
        mockExamConfig: { select: { title: true, isActive: true } }
      }
    })

    // Compute attemptNumber via raw SQL ROW_NUMBER (deterministic on tied timestamps).
    // Single query for the page's attempts; no per-row N+1.
    const ids = rows.map((r) => r.id)
    const numbered = await this.prisma.$queryRaw<Array<{ id: string; attempt_number: number }>>`
      SELECT id, attempt_number
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY student_id, mock_exam_config_id
            ORDER BY created_at, id
          )::int AS attempt_number
        FROM mock_exam_attempts
        WHERE student_id = ${studentId}
          AND exam_id = ${examId}
      ) t
      WHERE id = ANY(${ids}::text[])
    `

    const numberMap = new Map<string, number>()
    for (const n of numbered) {
      numberMap.set(n.id, Number(n.attempt_number))
    }

    const attempts = rows.map((r) => ({
      id: r.id,
      title: r.title,
      creationType: r.creationType,
      attemptNumber: r.creationType === 'CURATED' ? (numberMap.get(r.id) ?? null) : null,
      isFinished: r.isFinished,
      totalSlots: r.totalSlots,
      completedSlots: r.completedSlots,
      overallScore: r.overallScore,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      mockExamConfigId: r.mockExamConfigId,
      // Phase 5.1: flat fields, both nullable (STUDENT_GENERATED → null/null;
      // unexpected NULL join → null/null). Frontend reads these directly without nesting.
      mockExamConfigTitle: r.mockExamConfig?.title ?? null,
      mockExamConfigIsActive: r.mockExamConfig?.isActive ?? null
    }))

    return { attempts, total, limit, offset }
  }

  // ===== Phase 4: Regenerate AI feedback for a slot =====
  //
  // Uses generateFeedbackForExistingAttempt (simulation-attempt.service.ts:1782) which:
  //   - Skips LiveKit endSession (already ended)
  //   - Skips transcript polling (already in DB from the failed first attempt)
  //   - Re-runs only the AI step
  //   - THROWS on failure (unlike completeWithTranscript) — clean to map to 502
  // See Phase 3.5 resolution in mock-exam-progress.md for full rationale.

  async regenerateFeedback(
    attemptId: string,
    slotId: string,
    requestingStudentId: string
  ) {
    // Authorize via attempt
    const attempt = await this.prisma.mockExamAttempt.findUnique({ where: { id: attemptId } })
    if (!attempt || attempt.studentId !== requestingStudentId) {
      throw new Error('Mock exam attempt not found')
    }

    // Slot must belong to attempt and be already completed (have a simulationAttemptId)
    const slot = await this.prisma.mockExamSlot.findUnique({ where: { id: slotId } })
    if (!slot || slot.mockExamAttemptId !== attemptId) {
      throw new Error('Mock exam attempt not found')
    }
    if (!slot.simulationAttemptId) {
      throw new Error('Slot has no associated simulation attempt to regenerate')
    }

    // Throws on AI failure — caller maps to 502
    let updated: any
    try {
      updated = await this.simulationAttemptService.generateFeedbackForExistingAttempt(
        slot.simulationAttemptId
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`AI feedback generation failed: ${msg}`)
    }

    // The function may itself succeed but write a 'failed' status if the AI returned
    // an unparseable response. Detect and propagate.
    const fb = updated?.aiFeedback as any
    if (fb?.analysisStatus === 'failed') {
      const errMsg = typeof fb?.error === 'string' ? fb.error : 'AI feedback generation failed'
      throw new Error(`AI feedback generation failed: ${errMsg}`)
    }

    return {
      slotId,
      simulationAttemptId: slot.simulationAttemptId,
      aiFeedback: fb,
      score: updated?.score !== null && updated?.score !== undefined
        ? Number(updated.score.toString())
        : null
    }
  }

  // ===========================================================================
  // Phase 6: AI examiner summary
  // ===========================================================================
  // POST /api/mock-exam-attempts/:id/summary
  //
  // Idempotent: returns cached aiSummary if present; otherwise builds the LLM
  // input from completed slots, calls AIFeedbackService.generateMockExamSummary,
  // caches result, returns it. Mirrors getAnalysis's pattern (cache-first +
  // recompute on miss) but for narrative output instead of arithmetic.
  //
  // Auth + ownership: same string-matched error pattern as getAnalysis so the
  // route layer's mapServiceError works unchanged.
  //
  // Returns one of:
  //  - { available: true, summary, recommendations, generatedAt }
  //  - { available: false, reason: 'pre_phase_6' | 'insufficient_stations' }
  //
  // Throws on:
  //  - 'Mock exam attempt not found' (auth/ownership)
  //  - 'Attempt is not finished. Call /finish first to view summary.'
  //  - 'AI summary generation failed: <message>' → route maps to 502

  async getSummary(attemptId: string, requestingStudentId: string) {
    // Cheap pre-checks without loading slots.
    const cached = await this.prisma.mockExamAttempt.findFirst({
      where: { id: attemptId, studentId: requestingStudentId },
      select: {
        isFinished: true,
        completedSlots: true,
        finishedAt: true,
        aiSummary: true
      }
    })

    if (!cached) {
      throw new Error('Mock exam attempt not found')
    }
    if (!cached.isFinished) {
      throw new Error('Attempt is not finished. Call /finish first to view summary.')
    }

    if (cached.finishedAt && cached.finishedAt < PHASE_6_SUMMARY_CUTOFF) {
      return { available: false as const, reason: 'pre_phase_6' as const }
    }

    if (cached.completedSlots < MIN_STATIONS_FOR_SUMMARY) {
      return { available: false as const, reason: 'insufficient_stations' as const }
    }

    if (cached.aiSummary !== null && cached.aiSummary !== undefined) {
      return { available: true as const, ...(cached.aiSummary as unknown as MockExamSummaryResponse) }
    }

    // Cache miss — load full attempt, build input, call AI, cache, return.
    const fullAttempt = await this.prisma.mockExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        mockExamConfig: { select: { title: true } },
        slots: {
          where: { isCompleted: true },
          orderBy: { displayOrder: Prisma.SortOrder.asc },
          include: {
            courseCase: { select: { title: true } },
            simulationAttempt: { select: { score: true, aiFeedback: true } }
          }
        }
      }
    })
    if (!fullAttempt) {
      // Defensive — concurrent delete between the two queries.
      throw new Error('Mock exam attempt not found')
    }

    const input = this.buildSummaryInput(fullAttempt)

    let result: MockExamSummaryResponse
    try {
      result = await this.getAIService().generateMockExamSummary(input)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`AI summary generation failed: ${msg}`)
    }

    await this.prisma.mockExamAttempt.update({
      where: { id: attemptId },
      data: { aiSummary: result as unknown as Prisma.InputJsonValue }
    })

    return { available: true as const, ...result }
  }

  // Assemble the LLM input from a fully-loaded mock-exam attempt row.
  // Failed-AI stations are included with analysisStatus: 'failed' and a marker
  // so the model can acknowledge the gap without fabricating their content.
  private buildSummaryInput(attempt: any): MockExamSummaryInput {
    type DomainAcc = { name: string; achievedPoints: number; totalPoints: number }
    const domainAcc = new Map<string, DomainAcc>()

    const stations: MockExamSummaryStation[] = (attempt.slots as any[]).map((slot) => {
      const fb = slot.simulationAttempt?.aiFeedback as any
      const status: 'success' | 'failed' =
        fb && fb.analysisStatus !== 'failed' ? 'success' : 'failed'
      const stationDomains = (Array.isArray(fb?.markingDomains) ? fb.markingDomains : []).map(
        (d: any) => {
          const achieved = Number(d.achievedPoints ?? 0)
          const total = Number(d.totalPossiblePoints ?? 0)
          // Aggregate across stations for the breakdown — mirror getAnalysis arithmetic.
          if (status === 'success' && d.domainName) {
            const cur = domainAcc.get(d.domainName) ?? {
              name: d.domainName,
              achievedPoints: 0,
              totalPoints: 0
            }
            cur.achievedPoints += achieved
            cur.totalPoints += total
            domainAcc.set(d.domainName, cur)
          }
          return {
            domainName: String(d.domainName ?? ''),
            achievedPoints: achieved,
            totalPossiblePoints: total,
            percentage: total > 0 ? Math.round((achieved / total) * 1000) / 10 : 0
          }
        }
      )
      const score =
        slot.simulationAttempt?.score !== null && slot.simulationAttempt?.score !== undefined
          ? Number(slot.simulationAttempt.score.toString())
          : null
      return {
        displayOrder: slot.displayOrder,
        caseTitle: slot.courseCase?.title ?? '(case unavailable)',
        score,
        classificationLabel: status === 'success' ? (fb?.overallResult?.classificationLabel ?? null) : null,
        overallFeedback: status === 'success' ? (fb?.overallFeedback ?? null) : null,
        analysisStatus: status,
        domains: stationDomains
      }
    })

    const domainBreakdown: MockExamSummaryDomainBreakdown[] = Array.from(domainAcc.values()).map(
      (d) => {
        const percentage = d.totalPoints > 0 ? (d.achievedPoints / d.totalPoints) * 100 : 0
        const category: 'STRENGTH' | 'MODERATE' | 'WEAKNESS' =
          percentage >= 70 ? 'STRENGTH' : percentage >= 50 ? 'MODERATE' : 'WEAKNESS'
        return {
          domainName: d.name,
          percentage: Math.round(percentage * 10) / 10,
          category
        }
      }
    )

    return {
      examTitle: attempt.mockExamConfig?.title ?? attempt.title ?? 'Mock Exam',
      overallScore:
        attempt.overallScore !== null && attempt.overallScore !== undefined
          ? Number(attempt.overallScore.toString())
          : null,
      stations,
      domainBreakdown
    }
  }
}
