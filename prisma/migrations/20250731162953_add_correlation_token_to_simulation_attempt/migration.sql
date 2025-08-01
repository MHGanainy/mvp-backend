/*
  Warnings:

  - A unique constraint covering the columns `[correlationToken]` on the table `simulation_attempts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "simulation_attempts" ADD COLUMN     "correlationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "simulation_attempts_correlationToken_key" ON "simulation_attempts"("correlationToken");
