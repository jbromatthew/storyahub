-- 공사 확정 시 부품 투입 자동 재고 차감: 이동 기록에 출처 견적 연결
ALTER TABLE "ErpConstructionStockMove" ADD COLUMN "quoteId" TEXT;

ALTER TABLE "ErpConstructionStockMove" ADD CONSTRAINT "ErpConstructionStockMove_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "ErpConstructionQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ErpConstructionStockMove_quoteId_idx" ON "ErpConstructionStockMove"("quoteId");
