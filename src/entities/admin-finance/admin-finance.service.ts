import {
  PrismaClient,
  PaymentType,
  PaymentStatus,
  ResourceType,
  CheckoutSessionStatus,
} from '@prisma/client';

// ── Shared types ──────────────────────────────────────────────────────────────

interface ExamInfo {
  id: string;
  title: string;
  slug: string;
  kind: 'EXAM' | 'INTERVIEW';
}

interface ExamRevenueEntry {
  examId: string | null;
  examTitle: string;
  examSlug: string | null;
  resourceType: 'EXAM' | 'INTERVIEW' | 'MIXED' | 'UNATTRIBUTED';
  subscriptionRevenue: number;
  subscriptionPlatformShare: number;
  subscriptionInstructorShare: number;
  attributedCreditRevenue: number;
  creditPlatformShare: number;
  creditInstructorShare: number;
  totalRevenue: number;
  totalPlatformShare: number;
  totalInstructorShare: number;
  subscriptionCount: number;
  creditPurchaseCount: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AdminFinanceService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Builds lookup maps keyed by courseId / interviewCourseId and by the stable
   * "exam_<id>" / "interview_<id>" key used throughout this service.
   *
   * Called once per request; reused by both subscription and credit attribution.
   */
  private async buildLookups() {
    const [courses, interviewCourses] = await Promise.all([
      this.prisma.course.findMany({
        select: { id: true, exam: { select: { id: true, title: true, slug: true } } },
      }),
      this.prisma.interviewCourse.findMany({
        select: { id: true, interview: { select: { id: true, title: true, slug: true } } },
      }),
    ]);

    const courseToExam = new Map<string, ExamInfo>();
    const examKeyToInfo = new Map<string, ExamInfo>();

    for (const c of courses) {
      const info: ExamInfo = { id: c.exam.id, title: c.exam.title, slug: c.exam.slug, kind: 'EXAM' };
      courseToExam.set(c.id, info);
      examKeyToInfo.set(`exam_${c.exam.id}`, info);
    }

    const interviewCourseToInterview = new Map<string, ExamInfo>();

    for (const ic of interviewCourses) {
      const info: ExamInfo = {
        id: ic.interview.id,
        title: ic.interview.title,
        slug: ic.interview.slug,
        kind: 'INTERVIEW',
      };
      interviewCourseToInterview.set(ic.id, info);
      examKeyToInfo.set(`interview_${ic.interview.id}`, info);
    }

    return { courseToExam, interviewCourseToInterview, examKeyToInfo };
  }

  /**
   * Maps a Subscription's resourceType + resourceId to a stable exam key.
   * Returns null for BUNDLE or any resource that can't be resolved (→ Unattributed).
   */
  private resolveKey(
    resourceType: ResourceType,
    resourceId: string,
    courseToExam: Map<string, ExamInfo>,
    interviewCourseToInterview: Map<string, ExamInfo>
  ): { key: string; info: ExamInfo } | null {
    if (resourceType === ResourceType.COURSE) {
      const info = courseToExam.get(resourceId);
      return info ? { key: `exam_${info.id}`, info } : null;
    }
    if (resourceType === ResourceType.INTERVIEW_COURSE) {
      const info = interviewCourseToInterview.get(resourceId);
      return info ? { key: `interview_${info.id}`, info } : null;
    }
    return null;
  }

  // ── getOverview ─────────────────────────────────────────────────────────────
  // Subscription revenue  → Payment table  (paymentType = SUBSCRIPTION, paymentStatus = COMPLETED)
  // Credit top-up revenue → StripeCheckoutSession table (status = COMPLETED, amount in pence)

  async getOverview(startDate: Date, endDate: Date) {
    const [subPayments, creditSessions] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          paymentType: PaymentType.SUBSCRIPTION,
          paymentStatus: PaymentStatus.COMPLETED,
          amount: { gt: 0 },
          createdAt: { gte: startDate, lte: endDate },
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.stripeCheckoutSession.findMany({
        where: {
          status: CheckoutSessionStatus.COMPLETED,
          completedAt: { gte: startDate, lte: endDate },
        },
        select: { amountInCents: true, completedAt: true, createdAt: true },
      }),
    ]);

    let subscriptionRevenue = 0;
    let creditRevenue = 0;
    const dailyMap = new Map<string, { subscription: number; credits: number }>();

    for (const p of subPayments) {
      const amount = Number(p.amount);
      subscriptionRevenue += amount;
      const dateKey = p.createdAt.toISOString().split('T')[0];
      const day = dailyMap.get(dateKey) ?? { subscription: 0, credits: 0 };
      day.subscription += amount;
      dailyMap.set(dateKey, day);
    }

    for (const s of creditSessions) {
      const amount = s.amountInCents / 100;
      creditRevenue += amount;
      // Use completedAt as the revenue date; fall back to createdAt if null.
      const dateKey = (s.completedAt ?? s.createdAt).toISOString().split('T')[0];
      const day = dailyMap.get(dateKey) ?? { subscription: 0, credits: 0 };
      day.credits += amount;
      dailyMap.set(dateKey, day);
    }

    const totalRevenue = subscriptionRevenue + creditRevenue;

    const dailyRevenue = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        subscriptionRevenue: d.subscription,
        creditRevenue: d.credits,
        totalRevenue: d.subscription + d.credits,
      }));

    return {
      totalRevenue,
      subscriptionRevenue,
      creditRevenue,
      platformRevenue: subscriptionRevenue * 0.5 + creditRevenue * 0.75,
      instructorPayouts: subscriptionRevenue * 0.5 + creditRevenue * 0.25,
      totalTransactions: subPayments.length + creditSessions.length,
      subscriptionCount: subPayments.length,
      creditCount: creditSessions.length,
      dailyRevenue,
    };
  }

  // ── getExamRevenue ───────────────────────────────────────────────────────────

  async getExamRevenue(startDate: Date, endDate: Date): Promise<ExamRevenueEntry[]> {
    const { courseToExam, interviewCourseToInterview, examKeyToInfo } = await this.buildLookups();

    // ── Step 1: Subscription payments in period ───────────────────────────────
    const subPayments = await this.prisma.payment.findMany({
      where: {
        paymentType: PaymentType.SUBSCRIPTION,
        paymentStatus: PaymentStatus.COMPLETED,
        amount: { gt: 0 },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { subscription: { select: { resourceType: true, resourceId: true } } },
    });

    const examSubRevenue = new Map<string, { info: ExamInfo; amount: number; count: number }>();
    let unknownSubAmount = 0;
    let unknownSubCount = 0;

    for (const p of subPayments) {
      const amount = Number(p.amount);
      const sub = p.subscription;
      if (!sub) { unknownSubAmount += amount; unknownSubCount++; continue; }

      const resolved = this.resolveKey(
        sub.resourceType, sub.resourceId, courseToExam, interviewCourseToInterview
      );
      if (!resolved) { unknownSubAmount += amount; unknownSubCount++; continue; }

      const existing = examSubRevenue.get(resolved.key);
      if (existing) { existing.amount += amount; existing.count++; }
      else examSubRevenue.set(resolved.key, { info: resolved.info, amount, count: 1 });
    }

    // ── Step 2: Credit top-up sessions in period ──────────────────────────────
    // Credit purchases are stored in StripeCheckoutSession, not in Payment.
    const creditSessions = await this.prisma.stripeCheckoutSession.findMany({
      where: {
        status: CheckoutSessionStatus.COMPLETED,
        completedAt: { gte: startDate, lte: endDate },
      },
      select: { amountInCents: true, studentId: true },
    });

    if (creditSessions.length === 0) {
      return this.buildEntries(
        examSubRevenue, new Map(), 0, 0,
        unknownSubAmount, unknownSubCount, 0, 0
      );
    }

    // ── Step 3: Attribute each credit session to an exam ─────────────────────
    // Primary signal: student's ACTIVE subscriptions.
    // Fallback: simulation history (for students with no active subscriptions).
    const creditStudentIds = [...new Set(creditSessions.map((s: any) => s.studentId as string))];

    const activeStudentSubs = await this.prisma.subscription.findMany({
      where: {
        studentId: { in: creditStudentIds },
        isActive: true,
      },
      select: { studentId: true, resourceType: true, resourceId: true },
    });

    const studentExamKeys = new Map<string, Set<string>>();
    for (const sub of activeStudentSubs) {
      const resolved = this.resolveKey(
        sub.resourceType, sub.resourceId, courseToExam, interviewCourseToInterview
      );
      if (!resolved) continue;
      const set = studentExamKeys.get(sub.studentId) ?? new Set<string>();
      set.add(resolved.key);
      studentExamKeys.set(sub.studentId, set);
    }

    // ── Step 4: Simulation fallback ───────────────────────────────────────────
    const noSubStudents = creditStudentIds.filter(
      (id: string) => !(studentExamKeys.get(id)?.size)
    );

    if (noSubStudents.length > 0) {
      const simRows = await this.prisma.simulationAttempt.findMany({
        where: { studentId: { in: noSubStudents } },
        distinct: ['studentId', 'simulationId'],
        select: {
          studentId: true,
          simulation: { select: { courseCase: { select: { courseId: true } } } },
        },
      });

      for (const row of simRows) {
        const courseId = row.simulation.courseCase.courseId;
        const info = courseToExam.get(courseId);
        if (!info) continue;
        const key = `exam_${info.id}`;
        const set = studentExamKeys.get(row.studentId) ?? new Set<string>();
        set.add(key);
        studentExamKeys.set(row.studentId, set);
      }
    }

    // ── Step 5: Accumulate credit revenue per exam ────────────────────────────
    const examCreditRevenue = new Map<string, { info: ExamInfo; amount: number; count: number }>();
    let mixedCreditAmount = 0;
    let mixedCreditCount = 0;
    let unattributedCreditAmount = 0;
    let unattributedCreditCount = 0;

    for (const s of creditSessions) {
      const amount = (s as any).amountInCents / 100;
      const studentId = (s as any).studentId as string;
      const keys = studentExamKeys.get(studentId);

      if (!keys || keys.size === 0) {
        unattributedCreditAmount += amount;
        unattributedCreditCount++;
        continue;
      }
      if (keys.size > 1) {
        mixedCreditAmount += amount;
        mixedCreditCount++;
        continue;
      }

      const key = [...keys][0];
      const info = examKeyToInfo.get(key);
      if (!info) { unattributedCreditAmount += amount; unattributedCreditCount++; continue; }

      const existing = examCreditRevenue.get(key);
      if (existing) { existing.amount += amount; existing.count++; }
      else examCreditRevenue.set(key, { info, amount, count: 1 });
    }

    return this.buildEntries(
      examSubRevenue,
      examCreditRevenue,
      mixedCreditAmount,
      mixedCreditCount,
      unknownSubAmount + unattributedCreditAmount,
      unknownSubCount + unattributedCreditCount,
      unattributedCreditAmount,
      unattributedCreditCount
    );
  }

  private buildEntries(
    examSubRevenue: Map<string, { info: ExamInfo; amount: number; count: number }>,
    examCreditRevenue: Map<string, { info: ExamInfo; amount: number; count: number }>,
    mixedCreditAmount: number,
    mixedCreditCount: number,
    unknownTotalAmount: number,
    unknownTotalCount: number,
    unattributedCreditAmount: number,
    unattributedCreditCount: number
  ): ExamRevenueEntry[] {
    const allKeys = new Set([...examSubRevenue.keys(), ...examCreditRevenue.keys()]);
    const result: ExamRevenueEntry[] = [];

    for (const key of allKeys) {
      const subData = examSubRevenue.get(key);
      const creditData = examCreditRevenue.get(key);
      const info = (subData?.info ?? creditData?.info) as ExamInfo;

      const subRevenue = subData?.amount ?? 0;
      const creditRevenue = creditData?.amount ?? 0;
      const total = subRevenue + creditRevenue;

      result.push({
        examId: key,
        examTitle: info.title,
        examSlug: info.slug,
        resourceType: info.kind,
        subscriptionRevenue: subRevenue,
        subscriptionPlatformShare: subRevenue * 0.5,
        subscriptionInstructorShare: subRevenue * 0.5,
        attributedCreditRevenue: creditRevenue,
        creditPlatformShare: creditRevenue * 0.75,
        creditInstructorShare: creditRevenue * 0.25,
        totalRevenue: total,
        totalPlatformShare: subRevenue * 0.5 + creditRevenue * 0.75,
        totalInstructorShare: subRevenue * 0.5 + creditRevenue * 0.25,
        subscriptionCount: subData?.count ?? 0,
        creditPurchaseCount: creditData?.count ?? 0,
      });
    }

    if (mixedCreditAmount > 0) {
      result.push({
        examId: null,
        examTitle: 'Mixed / Multiple Exams',
        examSlug: null,
        resourceType: 'MIXED',
        subscriptionRevenue: 0,
        subscriptionPlatformShare: 0,
        subscriptionInstructorShare: 0,
        attributedCreditRevenue: mixedCreditAmount,
        creditPlatformShare: mixedCreditAmount * 0.75,
        creditInstructorShare: mixedCreditAmount * 0.25,
        totalRevenue: mixedCreditAmount,
        totalPlatformShare: mixedCreditAmount * 0.75,
        totalInstructorShare: mixedCreditAmount * 0.25,
        subscriptionCount: 0,
        creditPurchaseCount: mixedCreditCount,
      });
    }

    if (unknownTotalAmount > 0) {
      const unknownSubAmount = unknownTotalAmount - unattributedCreditAmount;
      const unknownSubCount = unknownTotalCount - unattributedCreditCount;
      result.push({
        examId: null,
        examTitle: 'Unattributed',
        examSlug: null,
        resourceType: 'UNATTRIBUTED',
        subscriptionRevenue: unknownSubAmount,
        subscriptionPlatformShare: unknownSubAmount * 0.5,
        subscriptionInstructorShare: unknownSubAmount * 0.5,
        attributedCreditRevenue: unattributedCreditAmount,
        creditPlatformShare: unattributedCreditAmount * 0.75,
        creditInstructorShare: unattributedCreditAmount * 0.25,
        totalRevenue: unknownTotalAmount,
        totalPlatformShare: unknownSubAmount * 0.5 + unattributedCreditAmount * 0.75,
        totalInstructorShare: unknownSubAmount * 0.5 + unattributedCreditAmount * 0.25,
        subscriptionCount: unknownSubCount,
        creditPurchaseCount: unattributedCreditCount,
      });
    }

    return result.sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  // ── getUserStats ─────────────────────────────────────────────────────────────
  // Counts cover both subscription payments (Payment) and credit top-ups
  // (StripeCheckoutSession) so that all revenue sources are reflected.

  async getUserStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    const completedSub = { paymentType: PaymentType.SUBSCRIPTION, paymentStatus: PaymentStatus.COMPLETED };
    const completedCredit = { status: CheckoutSessionStatus.COMPLETED };

    const [
      todayReg, weekReg, monthReg, totalStudents,
      todaySubPurchases, weekSubPurchases, monthSubPurchases,
      todayCreditPurchases, weekCreditPurchases, monthCreditPurchases,
      totalSubRevResult,
      totalCreditRevResult,
      recentSignups,
      last30SubGroups,
      last30CreditGroups,
      allSubGroups,
      allCreditGroups,
      topSubGroups,
      topCreditGroups,
    ] = await Promise.all([
      // Registrations
      this.prisma.student.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.student.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.student.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.student.count(),
      // Subscription purchase counts
      this.prisma.payment.count({ where: { ...completedSub, createdAt: { gte: todayStart } } }),
      this.prisma.payment.count({ where: { ...completedSub, createdAt: { gte: weekStart } } }),
      this.prisma.payment.count({ where: { ...completedSub, createdAt: { gte: monthStart } } }),
      // Credit purchase counts
      this.prisma.stripeCheckoutSession.count({ where: { ...completedCredit, completedAt: { gte: todayStart } } }),
      this.prisma.stripeCheckoutSession.count({ where: { ...completedCredit, completedAt: { gte: weekStart } } }),
      this.prisma.stripeCheckoutSession.count({ where: { ...completedCredit, completedAt: { gte: monthStart } } }),
      // All-time totals
      this.prisma.payment.aggregate({ where: { ...completedSub, amount: { gt: 0 } }, _sum: { amount: true } }),
      this.prisma.stripeCheckoutSession.aggregate({ where: completedCredit, _sum: { amountInCents: true } }),
      // Recent signups
      this.prisma.student.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, firstName: true, lastName: true, createdAt: true, creditBalance: true },
      }),
      // Last-30-day revenue by type (subscriptions)
      this.prisma.payment.aggregate({
        where: { ...completedSub, amount: { gt: 0 }, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      // Last-30-day credit revenue
      this.prisma.stripeCheckoutSession.aggregate({
        where: { ...completedCredit, completedAt: { gte: monthStart } },
        _sum: { amountInCents: true },
      }),
      // Per-student subscription spending (all time)
      this.prisma.payment.groupBy({
        by: ['studentId'],
        where: { ...completedSub, amount: { gt: 0 } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      // Per-student credit spending (all time)
      this.prisma.stripeCheckoutSession.groupBy({
        by: ['studentId'],
        where: completedCredit,
        _count: { id: true },
        _sum: { amountInCents: true },
      }),
      // Top sub payers
      this.prisma.payment.groupBy({
        by: ['studentId'],
        where: { ...completedSub, amount: { gt: 0 } },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 20,
      }),
      // Top credit payers
      this.prisma.stripeCheckoutSession.groupBy({
        by: ['studentId'],
        where: completedCredit,
        _sum: { amountInCents: true },
        _count: { id: true },
        orderBy: { _sum: { amountInCents: 'desc' } },
        take: 20,
      }),
    ]);

    // Merge per-student spending from both sources
    const studentSpending = new Map<string, { total: number; count: number }>();

    for (const g of allSubGroups as any[]) {
      const id = g.studentId as string;
      const entry = studentSpending.get(id) ?? { total: 0, count: 0 };
      entry.total += Number(g._sum.amount ?? 0);
      entry.count += g._count.id as number;
      studentSpending.set(id, entry);
    }
    for (const g of allCreditGroups as any[]) {
      const id = g.studentId as string;
      const entry = studentSpending.get(id) ?? { total: 0, count: 0 };
      entry.total += ((g._sum.amountInCents as number) ?? 0) / 100;
      entry.count += g._count.id as number;
      studentSpending.set(id, entry);
    }

    const uniquePaidUsers = studentSpending.size;
    const multiPurchaseUsers = [...studentSpending.values()].filter((e) => e.count > 1).length;
    const totalPurchaseCount = [...studentSpending.values()].reduce((s, e) => s + e.count, 0);
    const avgPurchasesPerPaidUser = uniquePaidUsers > 0 ? totalPurchaseCount / uniquePaidUsers : 0;

    const totalSubRevenue = Number(totalSubRevResult._sum.amount ?? 0);
    const totalCreditRevenue = ((totalCreditRevResult._sum.amountInCents as number) ?? 0) / 100;
    const totalRevenue = totalSubRevenue + totalCreditRevenue;
    const arpu = uniquePaidUsers > 0 ? totalRevenue / uniquePaidUsers : 0;
    const conversionRate = totalStudents > 0 ? (uniquePaidUsers / totalStudents) * 100 : 0;

    // Merge top payers from both sources and pick top 10
    const topSpenders = new Map<string, { total: number; count: number }>();
    for (const g of topSubGroups as any[]) {
      const id = g.studentId as string;
      const entry = topSpenders.get(id) ?? { total: 0, count: 0 };
      entry.total += Number(g._sum.amount ?? 0);
      entry.count += g._count.id as number;
      topSpenders.set(id, entry);
    }
    for (const g of topCreditGroups as any[]) {
      const id = g.studentId as string;
      const entry = topSpenders.get(id) ?? { total: 0, count: 0 };
      entry.total += ((g._sum.amountInCents as number) ?? 0) / 100;
      entry.count += g._count.id as number;
      topSpenders.set(id, entry);
    }

    const topPayerEntries = [...topSpenders.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10);

    const topPayerIds = topPayerEntries.map(([id]) => id);
    const topStudents = await this.prisma.student.findMany({
      where: { id: { in: topPayerIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameMap = new Map<string, string>();
    for (const s of topStudents) nameMap.set(s.id, `${s.firstName} ${s.lastName}`);

    const topPayers = topPayerEntries.map(([id, data]) => ({
      studentId: id,
      studentName: nameMap.get(id) ?? 'Unknown',
      totalSpent: data.total,
      purchaseCount: data.count,
    }));

    // Both are aggregate() results (not arrays). Type-cast once and access safely.
    const last30SubAgg = last30SubGroups as { _sum: { amount: unknown } };
    const last30CreditAgg = last30CreditGroups as { _sum: { amountInCents: unknown } };
    const last30SubRevenue = Number(last30SubAgg._sum?.amount ?? 0);
    const last30CreditRevenue = Number(last30CreditAgg._sum?.amountInCents ?? 0) / 100;

    return {
      registrations: { today: todayReg, week: weekReg, month: monthReg, total: totalStudents },
      purchases: {
        today: todaySubPurchases + todayCreditPurchases,
        week: weekSubPurchases + weekCreditPurchases,
        month: monthSubPurchases + monthCreditPurchases,
      },
      uniquePaidUsers,
      multiPurchaseUsers,
      avgPurchasesPerPaidUser: Math.round(avgPurchasesPerPaidUser * 100) / 100,
      arpu: Math.round(arpu * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      last30Days: {
        subscriptionRevenue: last30SubRevenue,
        creditRevenue: last30CreditRevenue,
        totalRevenue: last30SubRevenue + last30CreditRevenue,
      },
      recentSignups,
      topPayers,
    };
  }

  // ── getTransactions ──────────────────────────────────────────────────────────
  // Subscriptions → Payment table  |  Credits → StripeCheckoutSession table
  // When no type filter: both sources are merged in memory and paginated.

  async getTransactions(page: number, limit: number, paymentType?: string) {
    const skip = (page - 1) * limit;

    if (paymentType === 'SUBSCRIPTION') {
      const where = { paymentType: PaymentType.SUBSCRIPTION, paymentStatus: PaymentStatus.COMPLETED };
      const [payments, total] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            subscription: { select: { resourceType: true, isFreeTrial: true } },
            pricingPlan: { select: { name: true } },
          },
        }),
        this.prisma.payment.count({ where }),
      ]);

      return {
        data: payments.map((p: any) => ({
          id: `sub_${p.id}`,
          studentId: p.studentId,
          studentName: `${p.student.firstName} ${p.student.lastName}`,
          amount: Number(p.amount),
          currency: p.currency,
          paymentType: 'SUBSCRIPTION',
          creditsAmount: null,
          subscriptionDuration: p.subscriptionDuration,
          resourceType: p.subscription?.resourceType ?? null,
          pricingPlanName: p.pricingPlan?.name ?? null,
          isFreeTrial: p.subscription?.isFreeTrial ?? false,
          createdAt: p.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (paymentType === 'CREDITS') {
      const where = { status: CheckoutSessionStatus.COMPLETED };
      const [sessions, total] = await Promise.all([
        this.prisma.stripeCheckoutSession.findMany({
          where,
          orderBy: { completedAt: 'desc' },
          skip,
          take: limit,
          include: {
            student: { select: { id: true, firstName: true, lastName: true } },
            creditPackage: { select: { name: true } },
          },
        }),
        this.prisma.stripeCheckoutSession.count({ where }),
      ]);

      return {
        data: sessions.map((s: any) => ({
          id: `cred_${s.id}`,
          studentId: s.studentId,
          studentName: `${s.student.firstName} ${s.student.lastName}`,
          amount: s.amountInCents / 100,
          currency: 'GBP',
          paymentType: 'CREDITS',
          creditsAmount: s.creditsQuantity,
          subscriptionDuration: null,
          resourceType: null,
          pricingPlanName: s.creditPackage?.name ?? null,
          isFreeTrial: false,
          createdAt: s.completedAt ?? s.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // No filter → fetch recent from both sources, merge, paginate in memory.
    // Cap fetchLimit so a high page number can't trigger a massive DB scan.
    const MAX_FETCH = 2000;
    const fetchLimit = Math.min(skip + limit, MAX_FETCH);

    const [payments, sessions, totalSubs, totalCredits] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paymentType: PaymentType.SUBSCRIPTION, paymentStatus: PaymentStatus.COMPLETED },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          subscription: { select: { resourceType: true, isFreeTrial: true } },
          pricingPlan: { select: { name: true } },
        },
      }),
      this.prisma.stripeCheckoutSession.findMany({
        where: { status: CheckoutSessionStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
        take: fetchLimit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          creditPackage: { select: { name: true } },
        },
      }),
      this.prisma.payment.count({
        where: { paymentType: PaymentType.SUBSCRIPTION, paymentStatus: PaymentStatus.COMPLETED },
      }),
      this.prisma.stripeCheckoutSession.count({ where: { status: CheckoutSessionStatus.COMPLETED } }),
    ]);

    type Row = {
      id: string; studentId: string; studentName: string;
      amount: number; currency: string; paymentType: string;
      creditsAmount: number | null; subscriptionDuration: number | null;
      resourceType: string | null; pricingPlanName: string | null;
      isFreeTrial: boolean; createdAt: Date;
      _sortMs: number;
    };

    const rows: Row[] = [];

    for (const p of payments as any[]) {
      rows.push({
        id: `sub_${p.id}`, studentId: p.studentId,
        studentName: `${p.student.firstName} ${p.student.lastName}`,
        amount: Number(p.amount), currency: p.currency, paymentType: 'SUBSCRIPTION',
        creditsAmount: null, subscriptionDuration: p.subscriptionDuration,
        resourceType: p.subscription?.resourceType ?? null,
        pricingPlanName: p.pricingPlan?.name ?? null,
        isFreeTrial: p.subscription?.isFreeTrial ?? false,
        createdAt: p.createdAt, _sortMs: (p.createdAt as Date).getTime(),
      });
    }

    for (const s of sessions as any[]) {
      const ts = (s.completedAt ?? s.createdAt) as Date;
      rows.push({
        id: `cred_${s.id}`, studentId: s.studentId,
        studentName: `${s.student.firstName} ${s.student.lastName}`,
        amount: s.amountInCents / 100, currency: 'GBP', paymentType: 'CREDITS',
        creditsAmount: s.creditsQuantity, subscriptionDuration: null,
        resourceType: null, pricingPlanName: s.creditPackage?.name ?? null,
        isFreeTrial: false, createdAt: ts, _sortMs: ts.getTime(),
      });
    }

    rows.sort((a, b) => b._sortMs - a._sortMs);
    const pageRows = rows.slice(skip, skip + limit).map(({ _sortMs, ...rest }) => rest);
    const total = totalSubs + totalCredits;

    return { data: pageRows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
