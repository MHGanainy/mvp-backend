/*
  Warnings:

  - The values [MARKING_CRITERIA] on the enum `CaseTabType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CaseTabType_new" AS ENUM ('DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES');
ALTER TABLE "case_tabs" ALTER COLUMN "tab_type" TYPE "CaseTabType_new" USING ("tab_type"::text::"CaseTabType_new");
ALTER TYPE "CaseTabType" RENAME TO "CaseTabType_old";
ALTER TYPE "CaseTabType_new" RENAME TO "CaseTabType";
DROP TYPE "CaseTabType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "course_cases" DROP CONSTRAINT "course_cases_course_id_fkey";

-- DropForeignKey
ALTER TABLE "courses" DROP CONSTRAINT "courses_exam_id_fkey";

-- DropForeignKey
ALTER TABLE "credit_transactions" DROP CONSTRAINT "credit_transactions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "instructors" DROP CONSTRAINT "instructors_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_student_id_fkey";

-- DropForeignKey
ALTER TABLE "simulation_attempts" DROP CONSTRAINT "simulation_attempts_simulation_id_fkey";

-- DropForeignKey
ALTER TABLE "simulation_attempts" DROP CONSTRAINT "simulation_attempts_student_id_fkey";

-- DropForeignKey
ALTER TABLE "simulations" DROP CONSTRAINT "simulations_course_case_id_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_user_id_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_student_id_fkey";

-- CreateTable
CREATE TABLE "marking_criteria" (
    "id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "marking_domain_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marking_criteria_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_cases" ADD CONSTRAINT "course_cases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_criteria" ADD CONSTRAINT "marking_criteria_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_criteria" ADD CONSTRAINT "marking_criteria_marking_domain_id_fkey" FOREIGN KEY ("marking_domain_id") REFERENCES "marking_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
