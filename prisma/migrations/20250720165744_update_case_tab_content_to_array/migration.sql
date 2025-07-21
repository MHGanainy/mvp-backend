/*
  Warnings:

  - The `content` column on the `case_tabs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "case_tabs" DROP COLUMN "content",
ADD COLUMN     "content" TEXT[] DEFAULT ARRAY[]::TEXT[];
