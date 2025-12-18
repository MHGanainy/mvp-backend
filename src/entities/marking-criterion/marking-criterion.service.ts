import { PrismaClient } from "@prisma/client";
import {
  CreateMarkingCriterionInput,
  UpdateMarkingCriterionInput,
  BulkUpdateMarkingCriteriaInput,
} from "./marking-criterion.schema";

export class MarkingCriterionService {
  constructor(private prisma: PrismaClient) {}

  private getStandardInclude() {
    return {
      markingDomain: {
        select: { id: true, name: true },
      },
    };
  }

  async create(data: CreateMarkingCriterionInput) {
    // Verify foreign keys exist
    await this.prisma.courseCase.findUniqueOrThrow({
      where: { id: data.courseCaseId },
    });
    await this.prisma.markingDomain.findUniqueOrThrow({
      where: { id: data.markingDomainId },
    });

    return this.prisma.markingCriterion.create({
      data,
      include: this.getStandardInclude(),
    });
  }

  async findById(id: string) {
    const criterion = await this.prisma.markingCriterion.findUnique({
      where: { id },
      include: this.getStandardInclude(),
    });
    if (!criterion) throw new Error("Marking criterion not found");
    return criterion;
  }

  async findAllByCourseCase(courseCaseId: string) {
    const criteria = await this.prisma.markingCriterion.findMany({
      where: { courseCaseId },
      include: {
        markingDomain: true, // Include full markingDomain object
      },
      orderBy: [{ markingDomain: { name: "asc" } }, { displayOrder: "asc" }],
    });

    // Group criteria by marking domain but keep ALL fields
    const grouped = criteria.reduce((acc, criterion) => {
      const domainId = criterion.markingDomain.id;
      const domainName = criterion.markingDomain.name;

      let group = acc.find((g) => g.domainId === domainId);
      if (!group) {
        group = { domainId, domainName, criteria: [] };
        acc.push(group);
      }

      // Push the ENTIRE criterion object (all fields included)
      group.criteria.push({
        id: criterion.id,
        courseCaseId: criterion.courseCaseId,
        markingDomainId: criterion.markingDomainId,
        text: criterion.text,
        points: criterion.points,
        displayOrder: criterion.displayOrder,
        createdAt: criterion.createdAt,
      });

      return acc;
    }, [] as { domainId: string; domainName: string; criteria: any[] }[]);

    return grouped;
  }

  async update(id: string, data: UpdateMarkingCriterionInput) {
    await this.findById(id); // Ensure it exists
    return this.prisma.markingCriterion.update({
      where: { id },
      data,
      include: this.getStandardInclude(),
    });
  }

  async delete(id: string) {
    await this.findById(id); // Ensure it exists
    return this.prisma.markingCriterion.delete({ where: { id } });
  }

  async bulkUpdate(data: BulkUpdateMarkingCriteriaInput) {
    const { courseCaseId, criteria } = data;

    return this.prisma.$transaction(async (tx) => {
      // Get existing criteria for this case
      const existingCriteria = await tx.markingCriterion.findMany({
        where: { courseCaseId },
      });
      const existingIds = existingCriteria.map((c) => c.id);
      const incomingIds = criteria.map((c) => c.id).filter(Boolean) as string[];

      // IDs to delete: exist in DB but not in incoming array
      const idsToDelete = existingIds.filter((id) => !incomingIds.includes(id));
      if (idsToDelete.length > 0) {
        await tx.markingCriterion.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      // Update existing and create new criteria
      const results = [];
      for (const item of criteria) {
        if (item.id && existingIds.includes(item.id)) {
          // Update
          const updated = await tx.markingCriterion.update({
            where: { id: item.id },
            data: {
              markingDomainId: item.markingDomainId,
              text: item.text,
              points: item.points,
              displayOrder: item.displayOrder,
            },
            include: this.getStandardInclude(),
          });
          results.push(updated);
        } else {
          // Create
          const created = await tx.markingCriterion.create({
            data: {
              courseCaseId,
              markingDomainId: item.markingDomainId,
              text: item.text,
              points: item.points,
              displayOrder: item.displayOrder,
            },
            include: this.getStandardInclude(),
          });
          results.push(created);
        }
      }
      return results;
    });
  }

  async findAllByInterviewCase(interviewCaseId: string) {
    const criteria = await this.prisma.interviewMarkingCriterion.findMany({
      where: { interviewCaseId },
      include: {
        markingDomain: true, // Include full markingDomain object
      },
      orderBy: [{ markingDomain: { name: "asc" } }, { displayOrder: "asc" }],
    });

    // Group criteria by marking domain but keep ALL fields
    const grouped = criteria.reduce((acc, criterion) => {
      const domainId = criterion.markingDomain.id;
      const domainName = criterion.markingDomain.name;

      let group = acc.find((g) => g.domainId === domainId);
      if (!group) {
        group = { domainId, domainName, criteria: [] };
        acc.push(group);
      }

      // Push the ENTIRE criterion object (all fields included)
      group.criteria.push({
        id: criterion.id,
        interviewCaseId: criterion.interviewCaseId,
        markingDomainId: criterion.markingDomainId,
        text: criterion.text,
        points: criterion.points,
        displayOrder: criterion.displayOrder,
        createdAt: criterion.createdAt,
        updatedAt: criterion.updatedAt,
      });

      return acc;
    }, [] as { domainId: string; domainName: string; criteria: any[] }[]);

    return grouped;
  }

  async findAllByCaseId(caseId: string) {
    // Check if it's a course case or interview case
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (courseCase) {
      return this.findAllByCourseCase(caseId);
    }

    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (interviewCase) {
      return this.findAllByInterviewCase(caseId);
    }

    throw new Error("Case not found");
  }

  async getCaseStats(courseCaseId: string) {
    const criteria = await this.prisma.markingCriterion.findMany({
      where: { courseCaseId },
      include: { markingDomain: true },
    });

    const totalPoints = criteria.reduce((sum, c) => sum + c.points, 0);
    const domainStats = criteria.reduce((acc, criterion) => {
      const domainName = criterion.markingDomain.name;
      if (!acc[domainName]) {
        acc[domainName] = { count: 0, points: 0 };
      }
      acc[domainName].count++;
      acc[domainName].points += criterion.points;
      return acc;
    }, {} as Record<string, { count: number; points: number }>);

    return {
      totalCriteria: criteria.length,
      totalPoints,
      domainStats,
    };
  }

  async getInterviewCaseStats(interviewCaseId: string) {
    const criteria = await this.prisma.interviewMarkingCriterion.findMany({
      where: { interviewCaseId },
      include: { markingDomain: true },
    });

    const totalPoints = criteria.reduce((sum, c) => sum + c.points, 0);
    const domainStats = criteria.reduce((acc, criterion) => {
      const domainName = criterion.markingDomain.name;
      if (!acc[domainName]) {
        acc[domainName] = { count: 0, points: 0 };
      }
      acc[domainName].count++;
      acc[domainName].points += criterion.points;
      return acc;
    }, {} as Record<string, { count: number; points: number }>);

    return {
      totalCriteria: criteria.length,
      totalPoints,
      domainStats,
    };
  }

  async getCaseStatsByCaseId(caseId: string) {
    // Check if it's a course case or interview case
    const courseCase = await this.prisma.courseCase.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (courseCase) {
      return this.getCaseStats(caseId);
    }

    const interviewCase = await this.prisma.interviewCase.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (interviewCase) {
      return this.getInterviewCaseStats(caseId);
    }

    throw new Error("Case not found");
  }
}
