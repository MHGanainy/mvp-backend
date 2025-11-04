// src/entities/credit-package/credit-package.service.ts
import { PrismaClient } from '@prisma/client';
import { CreatePackageInput, UpdatePackageInput } from './credit-package.schema';

export class CreditPackageService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get all packages, optionally including inactive ones
   */
  async getAllPackages(includeInactive: boolean = false) {
    return await this.prisma.creditPackage.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: {
        priceInCents: 'asc', // Order by price ascending
      },
    });
  }

  /**
   * Get a single package by ID
   */
  async getPackageById(id: string) {
    const pkg = await this.prisma.creditPackage.findUnique({
      where: { id },
    });

    if (!pkg) {
      throw new Error('Credit package not found');
    }

    return pkg;
  }

  /**
   * Create a new credit package (admin only)
   */
  async createPackage(data: CreatePackageInput) {
    // Check if a package with the same name already exists
    const existing = await this.prisma.creditPackage.findFirst({
      where: { name: data.name },
    });

    if (existing) {
      throw new Error('A credit package with this name already exists');
    }

    return await this.prisma.creditPackage.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        credits: data.credits,
        priceInCents: data.priceInCents,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update an existing credit package (admin only)
   */
  async updatePackage(id: string, data: UpdatePackageInput) {
    // Check if package exists
    const existing = await this.getPackageById(id);

    // If updating name, check for duplicates
    if (data.name && data.name !== existing.name) {
      const duplicate = await this.prisma.creditPackage.findFirst({
        where: {
          name: data.name,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new Error('A credit package with this name already exists');
      }
    }

    return await this.prisma.creditPackage.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.credits !== undefined && { credits: data.credits }),
        ...(data.priceInCents !== undefined && { priceInCents: data.priceInCents }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Soft delete a credit package by setting isActive to false (admin only)
   */
  async deactivatePackage(id: string) {
    // Check if package exists
    await this.getPackageById(id);

    return await this.prisma.creditPackage.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Get active packages only (public endpoint)
   */
  async getActivePackages() {
    return await this.getAllPackages(false);
  }
}
