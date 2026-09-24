-- Keep the most recently touched default address for users that already have
-- duplicates, then enforce the invariant with a PostgreSQL partial unique index.
WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS row_number
  FROM "addresses"
  WHERE "isDefault" = true
)
UPDATE "addresses" AS address
SET "isDefault" = false
FROM ranked_defaults
WHERE address."id" = ranked_defaults."id"
  AND ranked_defaults.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "addresses_one_default_per_user"
  ON "addresses" ("userId")
  WHERE "isDefault" = true;
