-- CreateEnum
CREATE TYPE "CourseStyle" AS ENUM ('RANDOM', 'STRUCTURED');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "style" "CourseStyle" NOT NULL DEFAULT 'RANDOM',
    "price_3_months" DECIMAL(10,2) NOT NULL,
    "price_6_months" DECIMAL(10,2) NOT NULL,
    "price_12_months" DECIMAL(10,2) NOT NULL,
    "credits_3_months" INTEGER NOT NULL,
    "credits_6_months" INTEGER NOT NULL,
    "credits_12_months" INTEGER NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
