-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "replaced_by_id" TEXT,
ADD COLUMN     "revocado_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
