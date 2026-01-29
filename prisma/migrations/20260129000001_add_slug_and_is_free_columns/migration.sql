-- Add slug column to courses
ALTER TABLE "courses" ADD COLUMN "slug" TEXT;

-- Add unique index on (exam_id, slug) for courses
CREATE UNIQUE INDEX "courses_exam_id_slug_key" ON "courses"("exam_id", "slug");

-- Add slug column to course_cases
ALTER TABLE "course_cases" ADD COLUMN "slug" TEXT;

-- Add unique index on (course_id, slug) for course_cases
CREATE UNIQUE INDEX "course_cases_course_id_slug_key" ON "course_cases"("course_id", "slug");

-- Add is_free column to course_sections
ALTER TABLE "course_sections" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;

-- Add is_free column to course_subsections
ALTER TABLE "course_subsections" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;
