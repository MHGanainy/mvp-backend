/**
 * Data Migration Script: Populate slugs for existing InterviewCourse and InterviewCase records.
 *
 * Run this script after running the Prisma migration that adds slug fields:
 * npx ts-node prisma/scripts/populate-interview-slugs.ts
 *
 * This script:
 * 1. Fetches all interview courses and generates unique slugs per interview
 * 2. Fetches all interview cases and generates unique slugs per interview course
 * 3. Updates records with generated slugs
 */

import { PrismaClient } from '@prisma/client';
import { generateSlug } from '../../src/shared/slug';

const prisma = new PrismaClient();

async function populateInterviewCourseSlugs() {
  console.log('Populating InterviewCourse slugs...');

  const courses = await prisma.interviewCourse.findMany({
    select: { id: true, interviewId: true, title: true, slug: true },
    orderBy: { createdAt: 'asc' }
  });

  const usedSlugsByInterview: Record<string, Set<string>> = {};

  let updated = 0;
  for (const course of courses) {
    if (course.slug && course.slug.length > 0) {
      if (!usedSlugsByInterview[course.interviewId]) {
        usedSlugsByInterview[course.interviewId] = new Set();
      }
      usedSlugsByInterview[course.interviewId].add(course.slug);
      continue;
    }

    if (!usedSlugsByInterview[course.interviewId]) {
      usedSlugsByInterview[course.interviewId] = new Set();
    }

    let baseSlug = generateSlug(course.title);
    let slug = baseSlug;
    let counter = 1;

    while (usedSlugsByInterview[course.interviewId].has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    await prisma.interviewCourse.update({
      where: { id: course.id },
      data: { slug }
    });

    usedSlugsByInterview[course.interviewId].add(slug);
    updated++;
    console.log(`  InterviewCourse "${course.title}" -> slug: "${slug}"`);
  }

  console.log(`Updated ${updated} interview courses with slugs\n`);
}

async function populateInterviewCaseSlugs() {
  console.log('Populating InterviewCase slugs...');

  const cases = await prisma.interviewCase.findMany({
    select: { id: true, interviewCourseId: true, title: true, slug: true },
    orderBy: { displayOrder: 'asc' }
  });

  const usedSlugsByCourse: Record<string, Set<string>> = {};

  let updated = 0;
  for (const caseItem of cases) {
    if (caseItem.slug && caseItem.slug.length > 0) {
      if (!usedSlugsByCourse[caseItem.interviewCourseId]) {
        usedSlugsByCourse[caseItem.interviewCourseId] = new Set();
      }
      usedSlugsByCourse[caseItem.interviewCourseId].add(caseItem.slug);
      continue;
    }

    if (!usedSlugsByCourse[caseItem.interviewCourseId]) {
      usedSlugsByCourse[caseItem.interviewCourseId] = new Set();
    }

    let baseSlug = generateSlug(caseItem.title);
    let slug = baseSlug;
    let counter = 1;

    while (usedSlugsByCourse[caseItem.interviewCourseId].has(slug)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    await prisma.interviewCase.update({
      where: { id: caseItem.id },
      data: { slug }
    });

    usedSlugsByCourse[caseItem.interviewCourseId].add(slug);
    updated++;
    console.log(`  InterviewCase "${caseItem.title}" -> slug: "${slug}"`);
  }

  console.log(`Updated ${updated} interview cases with slugs\n`);
}

async function main() {
  console.log('===================================================');
  console.log('Starting Interview Slug Population');
  console.log('===================================================\n');

  try {
    await populateInterviewCourseSlugs();
    await populateInterviewCaseSlugs();

    console.log('===================================================');
    console.log('Interview slug population complete!');
    console.log('===================================================');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
