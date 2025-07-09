-- CreateEnum
CREATE TYPE "CaseTabType" AS ENUM ('DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MARKING_CRITERIA', 'MEDICAL_NOTES');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SUBSCRIPTION', 'CREDITS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CreditTransactionSource" AS ENUM ('SUBSCRIPTION', 'PURCHASE', 'SIMULATION', 'MANUAL');

-- CreateTable
CREATE TABLE "case_tabs" (
    "id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "tab_type" "CaseTabType" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "stripe_payment_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payment_type" "PaymentType" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "course_id" TEXT,
    "subscription_duration" INTEGER,
    "credits_amount" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "duration_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "transaction_type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "source_type" "CreditTransactionSource" NOT NULL,
    "source_id" TEXT,
    "description" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_specialties" (
    "exam_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_specialties_pkey" PRIMARY KEY ("exam_id","specialty_id")
);

-- CreateTable
CREATE TABLE "exam_curriculums" (
    "exam_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_curriculums_pkey" PRIMARY KEY ("exam_id","curriculum_id")
);

-- CreateTable
CREATE TABLE "exam_marking_domains" (
    "exam_id" TEXT NOT NULL,
    "marking_domain_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_marking_domains_pkey" PRIMARY KEY ("exam_id","marking_domain_id")
);

-- CreateTable
CREATE TABLE "case_specialties" (
    "course_case_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_specialties_pkey" PRIMARY KEY ("course_case_id","specialty_id")
);

-- CreateTable
CREATE TABLE "case_curriculums" (
    "course_case_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_curriculums_pkey" PRIMARY KEY ("course_case_id","curriculum_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_tabs_course_case_id_tab_type_key" ON "case_tabs"("course_case_id", "tab_type");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_id_key" ON "payments"("stripe_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_payment_id_key" ON "subscriptions"("payment_id");

-- AddForeignKey
ALTER TABLE "case_tabs" ADD CONSTRAINT "case_tabs_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_specialties" ADD CONSTRAINT "exam_specialties_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_specialties" ADD CONSTRAINT "exam_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_curriculums" ADD CONSTRAINT "exam_curriculums_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_curriculums" ADD CONSTRAINT "exam_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marking_domains" ADD CONSTRAINT "exam_marking_domains_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marking_domains" ADD CONSTRAINT "exam_marking_domains_marking_domain_id_fkey" FOREIGN KEY ("marking_domain_id") REFERENCES "marking_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_specialties" ADD CONSTRAINT "case_specialties_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_specialties" ADD CONSTRAINT "case_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_curriculums" ADD CONSTRAINT "case_curriculums_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_curriculums" ADD CONSTRAINT "case_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
