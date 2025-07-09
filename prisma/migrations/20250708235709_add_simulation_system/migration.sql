-- CreateEnum
CREATE TYPE "VoiceModel" AS ENUM ('VOICE_1', 'VOICE_2');

-- CreateTable
CREATE TABLE "simulations" (
    "id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "case_prompt" TEXT NOT NULL,
    "opening_line" TEXT NOT NULL,
    "time_limit_minutes" INTEGER NOT NULL,
    "voice_model" "VoiceModel" NOT NULL,
    "warning_time_minutes" INTEGER,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_attempts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "simulation_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(5,2),
    "ai_feedback" JSONB,
    "transcript" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulations_course_case_id_key" ON "simulations"("course_case_id");

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
