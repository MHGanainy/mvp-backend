-- Phase 1: Mock Exam schema. Adds 4 tables for the mock-exam playlist feature.
-- See thoughts/shared/plans/mock-exam-plan-v3.md and mock-exam-progress.md for context.

-- CreateTable
CREATE TABLE "mock_exam_configs" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'Intermediate',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_exam_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exam_stations" (
    "id" TEXT NOT NULL,
    "mock_exam_config_id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "mock_exam_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exam_attempts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "mock_exam_config_id" TEXT,
    "title" TEXT NOT NULL,
    "creation_type" TEXT NOT NULL,
    "is_finished" BOOLEAN NOT NULL DEFAULT false,
    "finished_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_slots" INTEGER NOT NULL,
    "completed_slots" INTEGER NOT NULL DEFAULT 0,
    "overall_score" DECIMAL(5,2),
    "analysis_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mock_exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_exam_slots" (
    "id" TEXT NOT NULL,
    "mock_exam_attempt_id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "simulation_attempt_id" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "mock_exam_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mock_exam_configs_exam_id_is_published_is_active_idx" ON "mock_exam_configs"("exam_id", "is_published", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_stations_mock_exam_config_id_course_case_id_key" ON "mock_exam_stations"("mock_exam_config_id", "course_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_stations_mock_exam_config_id_display_order_key" ON "mock_exam_stations"("mock_exam_config_id", "display_order");

-- CreateIndex
CREATE INDEX "mock_exam_attempts_student_id_exam_id_created_at_idx" ON "mock_exam_attempts"("student_id", "exam_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_slots_simulation_attempt_id_key" ON "mock_exam_slots"("simulation_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_slots_mock_exam_attempt_id_course_case_id_key" ON "mock_exam_slots"("mock_exam_attempt_id", "course_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "mock_exam_slots_mock_exam_attempt_id_display_order_key" ON "mock_exam_slots"("mock_exam_attempt_id", "display_order");

-- AddForeignKey
ALTER TABLE "mock_exam_configs" ADD CONSTRAINT "mock_exam_configs_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_configs" ADD CONSTRAINT "mock_exam_configs_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_stations" ADD CONSTRAINT "mock_exam_stations_mock_exam_config_id_fkey" FOREIGN KEY ("mock_exam_config_id") REFERENCES "mock_exam_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_stations" ADD CONSTRAINT "mock_exam_stations_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_attempts" ADD CONSTRAINT "mock_exam_attempts_mock_exam_config_id_fkey" FOREIGN KEY ("mock_exam_config_id") REFERENCES "mock_exam_configs"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_slots" ADD CONSTRAINT "mock_exam_slots_mock_exam_attempt_id_fkey" FOREIGN KEY ("mock_exam_attempt_id") REFERENCES "mock_exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_slots" ADD CONSTRAINT "mock_exam_slots_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_exam_slots" ADD CONSTRAINT "mock_exam_slots_simulation_attempt_id_fkey" FOREIGN KEY ("simulation_attempt_id") REFERENCES "simulation_attempts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
