-- 负余额台账（资金审计 M6）：冲正把已提现/已结算的余额扣成负数时，
-- 显式记录欠款额度（debt = max(0, -balance)，与余额同币种=账户结算币种）。
-- 此前负余额只是「balance < 0」的暗约定：提现被 balance>=amount 静默拦下、
-- 无告警、无追偿台账。debt 由冲正/结算路径在同一事务内派生维护。
ALTER TABLE "distributor_accounts" ADD COLUMN "debt" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- 存量负余额账户回填
UPDATE "distributor_accounts" SET "debt" = GREATEST(0, -"balance") WHERE "balance" < 0;
