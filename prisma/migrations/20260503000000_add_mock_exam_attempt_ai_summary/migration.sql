-- Phase 6: AI examiner summary cache.
-- Stores the cross-station narrative produced by the new
-- POST /api/mock-exam-attempts/:id/summary endpoint. Cached on first
-- successful generation; failed generations do NOT write here.
ALTER TABLE "mock_exam_attempts" ADD COLUMN "ai_summary" JSONB;
