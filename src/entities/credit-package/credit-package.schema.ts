// src/entities/credit-package/credit-package.schema.ts
import { z } from 'zod';

// Create Credit Package Schema
export const createPackageSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .trim(),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable(),
  credits: z.number()
    .int('Credits must be a whole number')
    .positive('Credits must be positive')
    .max(100000, 'Credits too high'),
  priceInCents: z.number()
    .int('Price must be in cents (whole number)')
    .positive('Price must be positive')
    .max(10000000, 'Price too high'), // Max $100,000
  isActive: z.boolean()
    .default(true)
    .optional(),
});

// Update Credit Package Schema (all fields optional)
export const updatePackageSchema = z.object({
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .nullable(),
  credits: z.number()
    .int('Credits must be a whole number')
    .positive('Credits must be positive')
    .max(100000, 'Credits too high')
    .optional(),
  priceInCents: z.number()
    .int('Price must be in cents (whole number)')
    .positive('Price must be positive')
    .max(10000000, 'Price too high')
    .optional(),
  isActive: z.boolean()
    .optional(),
});

// Package ID param schema
export const packageIdParamSchema = z.object({
  id: z.string().uuid('Invalid package ID'),
});

// Type exports
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type PackageIdParam = z.infer<typeof packageIdParamSchema>;
