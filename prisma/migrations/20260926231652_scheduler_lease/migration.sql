-- CreateTable
CREATE TABLE "scheduler_lease" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "holder" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_lease_pkey" PRIMARY KEY ("id")
);
