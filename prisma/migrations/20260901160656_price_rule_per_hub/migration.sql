-- Tariffs move from "a hub, or null for everywhere" to "always a hub".
--
-- A nullable hubId cannot carry the uniqueness this table needs: Postgres treats
-- NULLs as distinct, so two global rules for the same operation and pallet type
-- would both insert and the lookup would pick whichever came back first.
--
-- The old global rows have no hub to belong to, and the price book is a lookup
-- table the seed rebuilds, so they are cleared rather than guessed at.
DELETE FROM "PriceRule" WHERE "hubId" IS NULL;

ALTER TABLE "PriceRule" DROP CONSTRAINT "PriceRule_hubId_fkey";

ALTER TABLE "PriceRule" ALTER COLUMN "hubId" SET NOT NULL;

ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_hubId_fkey"
  FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
