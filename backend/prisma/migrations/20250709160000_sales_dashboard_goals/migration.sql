CREATE TABLE "ErpSalesDashboardGoalSet" (
    "month" TEXT NOT NULL,
    "industryGoals" JSONB NOT NULL DEFAULT '{}',
    "industryPlanGoals" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpSalesDashboardGoalSet_pkey" PRIMARY KEY ("month")
);
