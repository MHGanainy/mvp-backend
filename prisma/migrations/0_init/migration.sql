-- CreateEnum
CREATE TYPE "CourseStyle" AS ENUM ('RANDOM', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'PDF', 'TEXT', 'QUIZ');

-- CreateEnum
CREATE TYPE "PatientGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "VoiceModel" AS ENUM ('VOICE_1', 'VOICE_2');

-- CreateEnum
CREATE TYPE "CaseTabType" AS ENUM ('DOCTORS_NOTE', 'PATIENT_SCRIPT', 'MEDICAL_NOTES');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SUBSCRIPTION', 'CREDITS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "CreditTransactionSource" AS ENUM ('SUBSCRIPTION', 'PURCHASE', 'SIMULATION', 'MANUAL', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "CheckoutSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('COURSE', 'INTERVIEW_COURSE', 'BUNDLE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "BlogArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "oauth_provider" TEXT,
    "oauth_provider_id" TEXT,
    "email_verification_otp" TEXT,
    "otp_expires_at" TIMESTAMP(3),
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_registrations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "name" TEXT,
    "user_type" TEXT NOT NULL,
    "bio" TEXT,
    "otp" TEXT NOT NULL,
    "otp_expires_at" TIMESTAMP(3) NOT NULL,
    "referral_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instructors" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "credit_balance" INTEGER NOT NULL DEFAULT 0,
    "stripe_customer_id" TEXT,
    "default_payment_method" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "style" "CourseStyle" NOT NULL DEFAULT 'RANDOM',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "info_points" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_cases" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_age" INTEGER NOT NULL,
    "patient_gender" "PatientGender" NOT NULL,
    "description" TEXT NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marking_criteria" (
    "id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "marking_domain_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marking_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_tabs" (
    "id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "tab_type" "CaseTabType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "content" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "case_tabs_pkey" PRIMARY KEY ("id")
);

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
    "llm_provider_key" TEXT,
    "stt_provider_key" TEXT,
    "tts_provider_key" TEXT,

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
    "correlationToken" TEXT,
    "ai_prompt" JSONB,
    "minutes_billed" INTEGER DEFAULT 0,

    CONSTRAINT "simulation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_subsections" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content_type" "ContentType" NOT NULL,
    "content" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "estimated_duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "course_subsections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subsection_progress" (
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

    CONSTRAINT "subsection_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_courses" (
    "id" TEXT NOT NULL,
    "interview_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "style" "CourseStyle" NOT NULL DEFAULT 'RANDOM',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "info_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slug" TEXT,

    CONSTRAINT "interview_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_cases" (
    "id" TEXT NOT NULL,
    "interview_course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_age" INTEGER NOT NULL,
    "patient_gender" "PatientGender" NOT NULL,
    "description" TEXT NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "slug" TEXT,

    CONSTRAINT "interview_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_case_tabs" (
    "id" TEXT NOT NULL,
    "interview_case_id" TEXT NOT NULL,
    "tab_type" "CaseTabType" NOT NULL,
    "content" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_case_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_marking_criteria" (
    "id" TEXT NOT NULL,
    "interview_case_id" TEXT NOT NULL,
    "marking_domain_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_marking_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_simulations" (
    "id" TEXT NOT NULL,
    "interview_case_id" TEXT NOT NULL,
    "case_prompt" TEXT NOT NULL,
    "opening_line" TEXT NOT NULL,
    "time_limit_minutes" INTEGER NOT NULL,
    "voice_model" "VoiceModel" NOT NULL,
    "warning_time_minutes" INTEGER,
    "credit_cost" INTEGER NOT NULL DEFAULT 1,
    "llm_provider_key" TEXT,
    "stt_provider_key" TEXT,
    "tts_provider_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_simulation_attempts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "interview_simulation_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "score" DECIMAL(5,2),
    "ai_feedback" JSONB,
    "transcript" JSONB,
    "correlationToken" TEXT,
    "ai_prompt" JSONB,
    "minutes_billed" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_simulation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "stripe_payment_id" TEXT NOT NULL,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "payment_type" "PaymentType" NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL,
    "course_id" TEXT,
    "subscription_duration" INTEGER,
    "credits_amount" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pricing_plan_id" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT,
    "payment_id" TEXT NOT NULL,
    "duration_months" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resource_type" "ResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "pricing_plan_id" TEXT,
    "subscription_source" TEXT,
    "is_free_trial" BOOLEAN NOT NULL DEFAULT false,
    "duration_hours" INTEGER,

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
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculums" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curriculums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marking_domains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marking_domains_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "interview_specialties" (
    "interview_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_specialties_pkey" PRIMARY KEY ("interview_id","specialty_id")
);

-- CreateTable
CREATE TABLE "interview_curriculums" (
    "interview_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_curriculums_pkey" PRIMARY KEY ("interview_id","curriculum_id")
);

-- CreateTable
CREATE TABLE "interview_marking_domains" (
    "interview_id" TEXT NOT NULL,
    "marking_domain_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_marking_domains_pkey" PRIMARY KEY ("interview_id","marking_domain_id")
);

-- CreateTable
CREATE TABLE "interview_case_specialties" (
    "interview_case_id" TEXT NOT NULL,
    "specialty_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_case_specialties_pkey" PRIMARY KEY ("interview_case_id","specialty_id")
);

-- CreateTable
CREATE TABLE "interview_case_curriculums" (
    "interview_case_id" TEXT NOT NULL,
    "curriculum_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_case_curriculums_pkey" PRIMARY KEY ("interview_case_id","curriculum_id")
);

-- CreateTable
CREATE TABLE "student_case_practice" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_case_id" TEXT NOT NULL,
    "is_practiced" BOOLEAN NOT NULL DEFAULT false,
    "practice_count" INTEGER NOT NULL DEFAULT 0,
    "first_practiced_at" TIMESTAMP(3),
    "last_practiced_at" TIMESTAMP(3),
    "is_bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "bookmarked_at" TIMESTAMP(3),
    "marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "personal_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_case_practice_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "affiliates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_checkout_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "credit_package_id" TEXT NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "credits_quantity" INTEGER NOT NULL,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" TEXT NOT NULL,
    "resource_type" "ResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_months" INTEGER,
    "duration_hours" INTEGER,
    "price_in_cents" INTEGER NOT NULL,
    "credits_included" INTEGER,
    "is_free_trial_plan" BOOLEAN NOT NULL DEFAULT false,
    "feature_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_order" INTEGER NOT NULL,
    "is_popular" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_checkout_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "pricing_plan_id" TEXT NOT NULL,
    "resource_type" "ResourceType" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "status" "CheckoutSessionStatus" NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "duration_months" INTEGER,
    "duration_hours" INTEGER,
    "credits_included" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "promo_code_id" TEXT,
    "discount_amount_in_cents" INTEGER,
    "final_amount_in_cents" INTEGER,

    CONSTRAINT "subscription_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "max_uses" INTEGER,
    "current_uses" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "resource_type" "ResourceType",
    "resource_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_code_redemptions" (
    "id" TEXT NOT NULL,
    "promo_code_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount_saved" INTEGER NOT NULL DEFAULT 0,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "meta_description" VARCHAR(160),
    "featured_image_url" VARCHAR(500),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_articles" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "headline" VARCHAR(110) NOT NULL,
    "subheadline" VARCHAR(150),
    "meta_description" VARCHAR(160) NOT NULL,
    "meta_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "tldr" TEXT,
    "author_id" INTEGER NOT NULL,
    "published_date" TIMESTAMP(3),
    "updated_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "BlogArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "word_count" INTEGER NOT NULL,
    "reading_time_minutes" INTEGER NOT NULL,
    "featured_image_url" VARCHAR(500) NOT NULL,
    "featured_image_alt" TEXT NOT NULL,
    "featured_image_caption" TEXT,
    "blur_data_url" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "blog_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_categories" (
    "article_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("article_id","category_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_tags" (
    "article_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateTable
CREATE TABLE "article_faqs" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_related_content" (
    "article_id" TEXT NOT NULL,
    "related_article_id" TEXT NOT NULL,
    "relevance_score" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_related_content_pkey" PRIMARY KEY ("article_id","related_article_id")
);

-- CreateTable
CREATE TABLE "blocked_email_domains" (
    "id" SERIAL NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_email_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");

-- CreateIndex
CREATE UNIQUE INDEX "users_oauth_provider_oauth_provider_id_key" ON "users"("oauth_provider", "oauth_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "pending_registrations_email_key" ON "pending_registrations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "instructors_user_id_key" ON "instructors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_stripe_customer_id_key" ON "students"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "exams_slug_key" ON "exams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "courses_exam_id_slug_key" ON "courses"("exam_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "course_cases_course_id_slug_key" ON "course_cases"("course_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "case_tabs_course_case_id_tab_type_key" ON "case_tabs"("course_case_id", "tab_type");

-- CreateIndex
CREATE UNIQUE INDEX "simulations_course_case_id_key" ON "simulations"("course_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_attempts_correlationToken_key" ON "simulation_attempts"("correlationToken");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_student_id_course_id_key" ON "course_enrollments"("student_id", "course_id");

-- CreateIndex
CREATE UNIQUE INDEX "subsection_progress_enrollment_id_subsection_id_key" ON "subsection_progress"("enrollment_id", "subsection_id");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_slug_key" ON "interviews"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "interview_courses_interview_id_slug_key" ON "interview_courses"("interview_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "interview_cases_interview_course_id_slug_key" ON "interview_cases"("interview_course_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "interview_case_tabs_interview_case_id_tab_type_key" ON "interview_case_tabs"("interview_case_id", "tab_type");

-- CreateIndex
CREATE UNIQUE INDEX "interview_simulations_interview_case_id_key" ON "interview_simulations"("interview_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_simulation_attempts_correlationToken_key" ON "interview_simulation_attempts"("correlationToken");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_id_key" ON "payments"("stripe_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_payment_id_key" ON "subscriptions"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_student_resource_unique" ON "subscriptions"("student_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "credit_transactions_student_id_created_at_idx" ON "credit_transactions"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_name_key" ON "specialties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "curriculums_name_key" ON "curriculums"("name");

-- CreateIndex
CREATE UNIQUE INDEX "marking_domains_name_key" ON "marking_domains"("name");

-- CreateIndex
CREATE INDEX "student_case_practice_student_id_is_practiced_idx" ON "student_case_practice"("student_id", "is_practiced");

-- CreateIndex
CREATE INDEX "student_case_practice_student_id_is_bookmarked_idx" ON "student_case_practice"("student_id", "is_bookmarked");

-- CreateIndex
CREATE UNIQUE INDEX "student_case_practice_student_id_course_case_id_key" ON "student_case_practice"("student_id", "course_case_id");

-- CreateIndex
CREATE INDEX "student_interview_practice_student_id_is_practiced_idx" ON "student_interview_practice"("student_id", "is_practiced");

-- CreateIndex
CREATE INDEX "student_interview_practice_student_id_is_bookmarked_idx" ON "student_interview_practice"("student_id", "is_bookmarked");

-- CreateIndex
CREATE UNIQUE INDEX "student_interview_practice_student_id_interview_case_id_key" ON "student_interview_practice"("student_id", "interview_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_course_enrollments_student_id_interview_course_id_key" ON "interview_course_enrollments"("student_id", "interview_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_subsection_progress_enrollment_id_subsection_id_key" ON "interview_subsection_progress"("enrollment_id", "subsection_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_user_id_key" ON "referrals"("user_id");

-- CreateIndex
CREATE INDEX "referrals_affiliate_id_idx" ON "referrals"("affiliate_id");

-- CreateIndex
CREATE INDEX "referrals_code_idx" ON "referrals"("code");

-- CreateIndex
CREATE INDEX "credit_packages_is_active_idx" ON "credit_packages"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_checkout_sessions_session_id_key" ON "stripe_checkout_sessions"("session_id");

-- CreateIndex
CREATE INDEX "stripe_checkout_sessions_student_id_idx" ON "stripe_checkout_sessions"("student_id");

-- CreateIndex
CREATE INDEX "stripe_checkout_sessions_session_id_idx" ON "stripe_checkout_sessions"("session_id");

-- CreateIndex
CREATE INDEX "stripe_checkout_sessions_status_expires_at_idx" ON "stripe_checkout_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_event_id_key" ON "stripe_webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_event_id_idx" ON "stripe_webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processed_idx" ON "stripe_webhook_events"("processed");

-- CreateIndex
CREATE INDEX "pricing_plans_resource_type_resource_id_is_active_idx" ON "pricing_plans"("resource_type", "resource_id", "is_active");

-- CreateIndex
CREATE INDEX "pricing_plans_resource_type_resource_id_is_free_trial_plan_idx" ON "pricing_plans"("resource_type", "resource_id", "is_free_trial_plan");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_checkout_sessions_session_id_key" ON "subscription_checkout_sessions"("session_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_student_id_idx" ON "subscription_checkout_sessions"("student_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_session_id_idx" ON "subscription_checkout_sessions"("session_id");

-- CreateIndex
CREATE INDEX "subscription_checkout_sessions_status_expires_at_idx" ON "subscription_checkout_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "promo_code_redemptions_promo_code_id_student_id_key" ON "promo_code_redemptions"("promo_code_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE INDEX "blog_categories_is_active_idx" ON "blog_categories"("is_active");

-- CreateIndex
CREATE INDEX "blog_categories_display_order_idx" ON "blog_categories"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "blog_articles_slug_key" ON "blog_articles"("slug");

-- CreateIndex
CREATE INDEX "blog_articles_status_idx" ON "blog_articles"("status");

-- CreateIndex
CREATE INDEX "blog_articles_author_id_idx" ON "blog_articles"("author_id");

-- CreateIndex
CREATE INDEX "blog_articles_published_date_idx" ON "blog_articles"("published_date" DESC);

-- CreateIndex
CREATE INDEX "article_categories_category_id_idx" ON "article_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "article_tags_tag_id_idx" ON "article_tags"("tag_id");

-- CreateIndex
CREATE INDEX "article_faqs_article_id_idx" ON "article_faqs"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_faqs_article_id_position_key" ON "article_faqs"("article_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_email_domains_domain_key" ON "blocked_email_domains"("domain");

-- AddForeignKey
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_cases" ADD CONSTRAINT "course_cases_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_criteria" ADD CONSTRAINT "marking_criteria_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_criteria" ADD CONSTRAINT "marking_criteria_marking_domain_id_fkey" FOREIGN KEY ("marking_domain_id") REFERENCES "marking_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_tabs" ADD CONSTRAINT "case_tabs_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_simulation_id_fkey" FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_attempts" ADD CONSTRAINT "simulation_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_subsections" ADD CONSTRAINT "course_subsections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subsection_progress" ADD CONSTRAINT "subsection_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subsection_progress" ADD CONSTRAINT "subsection_progress_subsection_id_fkey" FOREIGN KEY ("subsection_id") REFERENCES "course_subsections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_courses" ADD CONSTRAINT "interview_courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_courses" ADD CONSTRAINT "interview_courses_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_cases" ADD CONSTRAINT "interview_cases_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_case_tabs" ADD CONSTRAINT "interview_case_tabs_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_marking_criteria" ADD CONSTRAINT "interview_marking_criteria_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_marking_criteria" ADD CONSTRAINT "interview_marking_criteria_marking_domain_id_fkey" FOREIGN KEY ("marking_domain_id") REFERENCES "marking_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_simulations" ADD CONSTRAINT "interview_simulations_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_simulation_attempts" ADD CONSTRAINT "interview_simulation_attempts_interview_simulation_id_fkey" FOREIGN KEY ("interview_simulation_id") REFERENCES "interview_simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_simulation_attempts" ADD CONSTRAINT "interview_simulation_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_pricing_plan_id_fkey" FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pricing_plan_id_fkey" FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_specialties" ADD CONSTRAINT "exam_specialties_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_specialties" ADD CONSTRAINT "exam_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_curriculums" ADD CONSTRAINT "exam_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_curriculums" ADD CONSTRAINT "exam_curriculums_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "interview_specialties" ADD CONSTRAINT "interview_specialties_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_specialties" ADD CONSTRAINT "interview_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_curriculums" ADD CONSTRAINT "interview_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_curriculums" ADD CONSTRAINT "interview_curriculums_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_marking_domains" ADD CONSTRAINT "interview_marking_domains_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_marking_domains" ADD CONSTRAINT "interview_marking_domains_marking_domain_id_fkey" FOREIGN KEY ("marking_domain_id") REFERENCES "marking_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_case_specialties" ADD CONSTRAINT "interview_case_specialties_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_case_specialties" ADD CONSTRAINT "interview_case_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_case_curriculums" ADD CONSTRAINT "interview_case_curriculums_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_case_curriculums" ADD CONSTRAINT "interview_case_curriculums_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_case_practice" ADD CONSTRAINT "student_case_practice_course_case_id_fkey" FOREIGN KEY ("course_case_id") REFERENCES "course_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_case_practice" ADD CONSTRAINT "student_case_practice_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_interview_practice" ADD CONSTRAINT "student_interview_practice_interview_case_id_fkey" FOREIGN KEY ("interview_case_id") REFERENCES "interview_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_interview_practice" ADD CONSTRAINT "student_interview_practice_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_sections" ADD CONSTRAINT "interview_course_sections_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_subsections" ADD CONSTRAINT "interview_course_subsections_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "interview_course_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_enrollments" ADD CONSTRAINT "interview_course_enrollments_interview_course_id_fkey" FOREIGN KEY ("interview_course_id") REFERENCES "interview_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_course_enrollments" ADD CONSTRAINT "interview_course_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subsection_progress" ADD CONSTRAINT "interview_subsection_progress_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "interview_course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_subsection_progress" ADD CONSTRAINT "interview_subsection_progress_subsection_id_fkey" FOREIGN KEY ("subsection_id") REFERENCES "interview_course_subsections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_checkout_sessions" ADD CONSTRAINT "stripe_checkout_sessions_credit_package_id_fkey" FOREIGN KEY ("credit_package_id") REFERENCES "credit_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_checkout_sessions" ADD CONSTRAINT "stripe_checkout_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_checkout_sessions" ADD CONSTRAINT "subscription_checkout_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_checkout_sessions" ADD CONSTRAINT "subscription_checkout_sessions_pricing_plan_id_fkey" FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_checkout_sessions" ADD CONSTRAINT "subscription_checkout_sessions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_articles" ADD CONSTRAINT "blog_articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "blog_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "blog_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "blog_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_faqs" ADD CONSTRAINT "article_faqs_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "blog_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_related_content" ADD CONSTRAINT "article_related_content_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "blog_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_related_content" ADD CONSTRAINT "article_related_content_related_article_id_fkey" FOREIGN KEY ("related_article_id") REFERENCES "blog_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

