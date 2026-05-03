-- CreateEnum
CREATE TYPE "PermissionRole" AS ENUM ('case_collaborator', 'case_editor');

-- CreateEnum
CREATE TYPE "PermissionResourceType" AS ENUM ('exam', 'course', 'interview', 'interview_course');

-- AlterTable
ALTER TABLE "course_cases" ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "interview_cases" ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "permission_grants" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "PermissionRole" NOT NULL,
    "resource_type" "PermissionResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "granted_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "permission_grants_resource_type_resource_id_idx" ON "permission_grants"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "permission_grants_user_id_idx" ON "permission_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grants_user_id_role_resource_type_resource_id_key" ON "permission_grants"("user_id", "role", "resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
