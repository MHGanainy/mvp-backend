-- Phase 0: CourseCase soft-delete prep.
-- Adds is_active flag and a composite filter index. The pre-existing
-- course_cases_course_id_slug_key full unique index is intentionally left in
-- place so slugs are reserved across both active and archived cases.

-- 1. Add is_active column. Defaults to true so all existing rows remain active.
ALTER TABLE "course_cases" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- 2. Slug uniqueness preserved across active and archived cases.
-- Archived cases retain their slugs; the existing course_cases_course_id_slug_key
-- unique index continues to apply to all rows regardless of is_active.

-- 3. Composite index to support the common filter (cases for a course, filtered by is_active).
CREATE INDEX "course_cases_course_id_is_active_idx" ON "course_cases" ("course_id", "is_active");
