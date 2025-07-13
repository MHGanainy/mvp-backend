-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "info_points" TEXT[] DEFAULT ARRAY[]::TEXT[];
