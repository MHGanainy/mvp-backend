-- AlterTable
ALTER TABLE "simulations" ADD COLUMN     "llm_provider_key" TEXT,
ADD COLUMN     "stt_provider_key" TEXT,
ADD COLUMN     "tts_provider_key" TEXT;
