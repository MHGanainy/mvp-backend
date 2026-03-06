import { PrismaClient, ResourceType } from '@prisma/client';
import { CreatePricingPlanInput, UpdatePricingPlanInput } from './pricing-plan.schema';

const MAX_ACTIVE_PLANS = 4;

export class PricingPlanService {
  constructor(private prisma: PrismaClient) {}

  async findByResource(resourceType: ResourceType, resourceId: string) {
    // Verify the resource exists and is published
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { isPublished: true },
      });
      if (!course) throw new Error('Course not found');
      if (!course.isPublished) throw new Error('This course is not currently available');
    } else if (resourceType === 'INTERVIEW_COURSE') {
      const ic = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { isPublished: true },
      });
      if (!ic) throw new Error('Interview course not found');
      if (!ic.isPublished) throw new Error('This interview course is not currently available');
    }

    return await this.prisma.pricingPlan.findMany({
      where: {
        resourceType,
        resourceId,
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findById(id: string) {
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new Error('Pricing plan not found');
    }

    return plan;
  }

  async create(data: CreatePricingPlanInput) {
    // Verify the resource exists
    await this.verifyResourceExists(data.resourceType as ResourceType, data.resourceId);

    // Check max active plans
    const activeCount = await this.prisma.pricingPlan.count({
      where: {
        resourceType: data.resourceType as ResourceType,
        resourceId: data.resourceId,
        isActive: true,
      },
    });

    if (activeCount >= MAX_ACTIVE_PLANS) {
      throw new Error(`Maximum ${MAX_ACTIVE_PLANS} active plans allowed per resource`);
    }

    return await this.prisma.pricingPlan.create({
      data: {
        resourceType: data.resourceType as ResourceType,
        resourceId: data.resourceId,
        name: data.name,
        description: data.description ?? null,
        durationMonths: data.durationMonths ?? null,
        durationHours: data.durationHours ?? null,
        priceInCents: data.priceInCents,
        creditsIncluded: data.creditsIncluded ?? null,
        isFreeTrialPlan: data.isFreeTrialPlan ?? false,
        featurePoints: data.featurePoints ?? [],
        displayOrder: data.displayOrder,
        isPopular: data.isPopular ?? false,
        isActive: true,
      },
    });
  }

  async update(id: string, data: UpdatePricingPlanInput) {
    await this.findById(id);

    return await this.prisma.pricingPlan.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.durationMonths !== undefined && { durationMonths: data.durationMonths }),
        ...(data.durationHours !== undefined && { durationHours: data.durationHours }),
        ...(data.priceInCents !== undefined && { priceInCents: data.priceInCents }),
        ...(data.creditsIncluded !== undefined && { creditsIncluded: data.creditsIncluded }),
        ...(data.isFreeTrialPlan !== undefined && { isFreeTrialPlan: data.isFreeTrialPlan }),
        ...(data.featurePoints !== undefined && { featurePoints: data.featurePoints }),
        ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
        ...(data.isPopular !== undefined && { isPopular: data.isPopular }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deactivate(id: string) {
    await this.findById(id);

    return await this.prisma.pricingPlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAll(filters?: { resourceType?: ResourceType; isActive?: boolean }) {
    return await this.prisma.pricingPlan.findMany({
      where: {
        ...(filters?.resourceType && { resourceType: filters.resourceType }),
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      },
      orderBy: [
        { resourceType: 'asc' },
        { resourceId: 'asc' },
        { displayOrder: 'asc' },
      ],
    });
  }

  async getResourceInstructorId(resourceType: ResourceType, resourceId: string): Promise<string | null> {
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { instructorId: true },
      });
      return course?.instructorId ?? null;
    }

    if (resourceType === 'INTERVIEW_COURSE') {
      const ic = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { instructorId: true },
      });
      return ic?.instructorId ?? null;
    }

    return null;
  }

  private async verifyResourceExists(resourceType: ResourceType, resourceId: string) {
    if (resourceType === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
      if (!course) throw new Error('Course not found');
      return;
    }

    if (resourceType === 'INTERVIEW_COURSE') {
      const ic = await this.prisma.interviewCourse.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
      if (!ic) throw new Error('Interview course not found');
      return;
    }

    throw new Error('Unsupported resource type');
  }
}
