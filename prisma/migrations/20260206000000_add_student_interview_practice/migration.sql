-- CreateTable
CREATE TABLE "student_interview_practice" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "interview_case_id" TEXT NOT NULL,
    "is_practiced" BOOLEAN NOT NULL DEFAULT false,
    "practice_count" INTEGER NOT NULL DEFAULT 0,
    "first_practiced_at" TIMESTAMP(3),
    "last_practiced_at" TIMESTAMP(3),
    "is_bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "bookmarked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_interview_practice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_interview_practice_student_id_interview_case_id_key" ON "student_interview_practice"("student_id", "interview_case_id");

-- CreateIndex
CREATE INDEX "student_interview_practice_student_id_is_practiced_idx" ON "student_interview_practice"("student_id", "is_practiced");

-- CreateIndex
CREATE INDEX "student_interview_practice_student_id_is_bookmarked_idx" ON "student_interview_practice"("student_id", "is_bookmarked");

-- AddForeignKey
ALTER TABLE "student_interview_practice" ADD CONSTRAINT "student_interview_practice_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_interview_practice" ADD CONSTRAINT "student_interview_practice_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
