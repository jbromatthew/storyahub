-- 크라이저 청구 확장: 세금계산서 승인번호, 브로제이 더블체크, 잔금 납품일자 목록
ALTER TABLE "ErpVendorOrder" ADD COLUMN "prepayTaxNo" TEXT;
ALTER TABLE "ErpVendorOrder" ADD COLUMN "prepayVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpVendorOrder" ADD COLUMN "balanceTaxNo" TEXT;
ALTER TABLE "ErpVendorOrder" ADD COLUMN "balanceVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ErpVendorOrder" ADD COLUMN "balanceDeliveryDates" JSONB NOT NULL DEFAULT '[]';
