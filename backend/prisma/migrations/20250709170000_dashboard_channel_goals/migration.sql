-- Add per-industry channel goal distribution to the sales dashboard goal set
ALTER TABLE "ErpSalesDashboardGoalSet"
  ADD COLUMN "industryChannelGoals" JSONB NOT NULL DEFAULT '{}';
