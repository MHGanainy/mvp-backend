-- CreateEnum
CREATE TYPE "AttemptType" AS ENUM ('CASE', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- DropForeignKey
ALTER TABLE "mock_exam_configs" DROP CONSTRAINT "mock_exam_configs_instructor_id_fkey";

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "recording_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "attempt_type" "AttemptType" NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "s3_key" TEXT NOT NULL,
    "egress_id" TEXT,
    "duration_seconds" INTEGER,
    "bytes" BIGINT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordings_egress_id_key" ON "recordings"("egress_id");

-- CreateIndex
CREATE INDEX "recordings_status_created_at_idx" ON "recordings"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_attempt_type_attempt_id_key" ON "recordings"("attempt_type", "attempt_id");

-- AddForeignKey
ALTER TABLE "mock_exam_configs" ADD CONSTRAINT "mock_exam_configs_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
