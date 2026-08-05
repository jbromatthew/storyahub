-- 아파트너 공사 청구 단계: 세금계산서 발행일자·승인번호
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "taxInvoiceDate" TEXT;
ALTER TABLE "ErpConstructionQuote" ADD COLUMN "taxInvoiceNo" TEXT;
