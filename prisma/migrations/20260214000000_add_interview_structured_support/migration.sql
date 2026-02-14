-- CreateTable
CREATE TABLE "interview_course_sections" (
    "id" TEXT NOT NULL,
    "interview_course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_course_subsections" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_type" "ContentType" NOT NULL,
    "content" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "estimated_duration" INTEGER,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_course_subsections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_course_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "interview_course_id" TEXT NOT NULL,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_subsection_progress" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "subsection_id" TEXT NOT NULL,
    "is_started" BOOLEAN NOT NULL DEFAULT false,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "quiz_score" INTEGER,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_subsection_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_subscriptions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "interview_course_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_course_enrollments_student_id_interview_course_id_key" ON "interview_course_enrollments"("student_id", "interview_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_subsection_progress_enrollment_id_subsection_id_key" ON "interview_subsection_progress"("enrollment_id", "subsection_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_subscriptions_payment_id_key" ON "interview_subscriptions"("payment_id");

-- AddForeignKey
ALTER TABLE "interview_course_sections" ADD CONSTRAINT "interview_course_sections_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_subsections" ADD CONSTRAINT "interview_course_subsections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "interview_course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_enrollments" ADD CONSTRAINT "interview_course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_enrollments" ADD CONSTRAINT "interview_course_enrollments_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subsection_progress" ADD CONSTRAINT "interview_subsection_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "interview_course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subsection_progress" ADD CONSTRAINT "interview_subsection_progress_subsection_id_fkey" FOREIGN KEY ("subsection_id") REFERENCES "interview_course_subsections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subscriptions" ADD CONSTRAINT "interview_subscriptions_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subscriptions" ADD CONSTRAINT "interview_subscriptions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subscriptions" ADD CONSTRAINT "interview_subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
