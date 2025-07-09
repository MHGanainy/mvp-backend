-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateTable
CREATE TABLE "course_cases" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_age" INTEGER NOT NULL,
    "patient_gender" "PatientGender" NOT NULL,
    "description" TEXT NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_cases_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "course_cases" ADD CONSTRAINT "course_cases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
