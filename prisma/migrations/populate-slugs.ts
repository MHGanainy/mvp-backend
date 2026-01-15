/**
 * Data Migration Script: Populate slugs for existing Course and CourseCase records.
 *
 * Run this script after running the Prisma migration that adds slug fields:
 * npx ts-node prisma/migrations/populate-slugs.ts
 *
 * This script:
 * 1. Fetches all courses and generates unique slugs per exam
 * 2. Fetches all course cases and generates unique slugs per course
 * 3. Updates records with generated slugs
 */

import { PrismaClient } from '@prisma/client';
import { generateSlug } from '../../src/shared/slug';

const prisma = new PrismaClient();

async function populateCourseSlugs() {
  console.log('🔄 Populating Course slugs...');

  // Get all courses grouped by exam
  const courses = await prisma.course.findMany({
    select: { id: true, examId: true, title: true, slug: true },
    orderBy: { createdAt: 'asc' }
  });

  // Track used slugs per exam
  const usedSlugsByExam: Record<string, Set<string>> = {};

  let updated = 0;
  for (const course of courses) {
    // Skip if slug already exists
    if (course.slug && course.slug.length > 0) {
      // Track existing slug
      if (!usedSlugsByExam[course.examId]) {
        usedSlugsByExam[course.examId] = new Set();
      }
      usedSlugsByExam[course.examId].add(course.slug);
      continue;
    }

    // Initialize set for exam if needed
    if (!usedSlugsByExam[course.examId]) {
      usedSlugsByExam[course.examId] = new Set();
    }

    // Generate unique slug for this exam
    let baseSlug = generateSlug(course.title);
    let slug = baseSlug;
    let counter = 1;

    while (usedSlugsByExam[course.examId].has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Update course with slug
    await prisma.course.update({
      where: { id: course.id },
      data: { slug }
    });

    usedSlugsByExam[course.examId].add(slug);
    updated++;
    console.log(`  ✅ Course "${course.title}" → slug: "${slug}"`);
  }

  console.log(`📊 Updated ${updated} courses with slugs\n`);
}

async function populateCourseCaseSlugs() {
  console.log('🔄 Populating CourseCase slugs...');

  // Get all course cases grouped by course
  const cases = await prisma.courseCase.findMany({
    select: { id: true, courseId: true, title: true, slug: true },
    orderBy: { displayOrder: 'asc' }
  });

  // Track used slugs per course
  const usedSlugsByCourse: Record<string, Set<string>> = {};

  let updated = 0;
  for (const caseItem of cases) {
    // Skip if slug already exists
    if (caseItem.slug && caseItem.slug.length > 0) {
      // Track existing slug
      if (!usedSlugsByCourse[caseItem.courseId]) {
        usedSlugsByCourse[caseItem.courseId] = new Set();
      }
      usedSlugsByCourse[caseItem.courseId].add(caseItem.slug);
      continue;
    }

    // Initialize set for course if needed
    if (!usedSlugsByCourse[caseItem.courseId]) {
      usedSlugsByCourse[caseItem.courseId] = new Set();
    }

    // Generate unique slug for this course
    let baseSlug = generateSlug(caseItem.title);
    let slug = baseSlug;
    let counter = 1;

    while (usedSlugsByCourse[caseItem.courseId].has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Update case with slug
    await prisma.courseCase.update({
      where: { id: caseItem.id },
      data: { slug }
    });

    usedSlugsByCourse[caseItem.courseId].add(slug);
    updated++;
    console.log(`  ✅ Case "${caseItem.title}" → slug: "${slug}"`);
  }

  console.log(`📊 Updated ${updated} course cases with slugs\n`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 Starting Slug Population Migration');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await populateCourseSlugs();
    await populateCourseCaseSlugs();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Slug population complete!');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
