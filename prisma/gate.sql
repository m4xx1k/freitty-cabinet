-- Does the seeded database actually produce the numbers drawn on the mockup?
-- Run with: pnpm db:gate
--
-- Every figure below is computed, never stored. If one of these drifts, the
-- seed is wrong — not the formula.

\pset border 2

\echo '── dashboard KPI ──'
SELECT
  (SELECT count(*) FROM "Order"
    WHERE "parentId" IS NULL
      AND status IN ('READY','IN_PROGRESS','CONSOLIDATED','IN_TRANSIT'))                    AS "active = 7",
  (SELECT count(*) FROM "Order"
    WHERE "parentId" IS NULL
      AND status IN ('READY','IN_PROGRESS','CONSOLIDATED','IN_TRANSIT')
      AND "createdAt" >= now() - interval '7 days')                                         AS "new this week = 2",
  (SELECT count(*) FROM "Order"
    WHERE "parentId" IS NULL AND status = 'CLOSED'
      AND "closedAt" >= now() - interval '30 days')                                         AS "completed 30d = 24",
  (SELECT count(*) FROM "Order"
    WHERE "parentId" IS NULL AND status = 'CLOSED'
      AND "closedAt" >= now() - interval '60 days'
      AND "closedAt" <  now() - interval '30 days')                                         AS "previous 30d = 20";

\echo '── list tabs, default window of last 30 days ──'
WITH win AS (
  SELECT * FROM "Order"
  WHERE "parentId" IS NULL
    AND greatest("scheduledAt", coalesce("closedAt", "scheduledAt")) >= now() - interval '30 days'
)
SELECT count(*)                                      AS "all = 32",
       count(*) FILTER (WHERE type = 'CROSS_DOCK')   AS "cross-dock = 26",
       count(*) FILTER (WHERE type = 'CONSOLIDATION') AS "consolidation = 6",
       count(*) FILTER (WHERE status = 'DRAFT')      AS "drafts = 1"
FROM win;

\echo '── FR001383: declared vs actual, and what actually ships ──'
SELECT o.number,
       (SELECT coalesce(sum("declaredQty"),0) FROM "CargoLine" c WHERE c."orderId" = o.id)                 AS "declared = 10",
       (SELECT coalesce(sum(qty),0) FROM "Operation" op WHERE op."orderId" = o.id AND op.kind='UNLOADING') AS "actual = 12",
       (SELECT coalesce(sum(qty),0) FROM "Operation" op WHERE op."orderId" = o.id AND op.kind='UNLOADING')
     - (SELECT coalesce(sum("declaredQty"),0) FROM "CargoLine" c WHERE c."orderId" = o.id)                 AS "delta = +2",
       (SELECT coalesce(sum(qty),0) FROM "Operation" op WHERE op."orderId" = o.id AND op.kind='UNLOADING')
     - (SELECT coalesce(sum(qty),0) FROM "Operation" op WHERE op."orderId" = o.id AND op.kind='DISPOSAL')  AS "shippable = 11"
FROM "Order" o WHERE o.number = 'FR001383';

\echo '── consolidations: the card total is the sum of its children ──'
SELECT p.number,
       count(k.id) AS refs,
       (SELECT coalesce(sum(c."declaredQty"),0) FROM "CargoLine" c
          JOIN "Order" x ON x.id = c."orderId"
         WHERE x."parentId" = p.id AND c."unitType" = 'STANDARD_48X40') AS std,
       (SELECT coalesce(sum(c."declaredQty"),0) FROM "CargoLine" c
          JOIN "Order" x ON x.id = c."orderId"
         WHERE x."parentId" = p.id AND c."unitType" = 'XL')             AS xl,
       (SELECT coalesce(sum(op.qty),0) FROM "Operation" op
          JOIN "Order" x ON x.id = op."orderId"
         WHERE x."parentId" = p.id AND op.kind = 'UNLOADING')           AS actual
FROM "Order" p JOIN "Order" k ON k."parentId" = p.id
WHERE p."parentId" IS NULL
GROUP BY p.id, p.number
ORDER BY p.number;

\echo '── alerts: exactly two orders, one of them client-actionable ──'
SELECT o.number,
       CASE WHEN (SELECT coalesce(sum(op.qty),0) FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
                   WHERE (x.id = o.id OR x."parentId" = o.id) AND op.kind = 'UNLOADING') > 0
             AND (SELECT coalesce(sum(op.qty),0) FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
                   WHERE (x.id = o.id OR x."parentId" = o.id) AND op.kind = 'UNLOADING')
              <> (SELECT coalesce(sum(c."declaredQty"),0) FROM "CargoLine" c JOIN "Order" x ON x.id = c."orderId"
                   WHERE x.id = o.id OR x."parentId" = o.id)
            THEN 'QTY_DELTA' END AS qty_delta,
       CASE WHEN EXISTS (SELECT 1 FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
                          WHERE (x.id = o.id OR x."parentId" = o.id) AND op."requiresPhoto"
                            AND NOT EXISTS (SELECT 1 FROM "Attachment" a
                                             WHERE a."operationId" = op.id AND a.kind = 'PHOTO'))
            THEN 'MISSING_PHOTO' END AS missing_photo
FROM "Order" o
WHERE o."parentId" IS NULL
  AND (
    (SELECT coalesce(sum(op.qty),0) FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
      WHERE (x.id = o.id OR x."parentId" = o.id) AND op.kind = 'UNLOADING') > 0
    AND (SELECT coalesce(sum(op.qty),0) FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
          WHERE (x.id = o.id OR x."parentId" = o.id) AND op.kind = 'UNLOADING')
     <> (SELECT coalesce(sum(c."declaredQty"),0) FROM "CargoLine" c JOIN "Order" x ON x.id = c."orderId"
          WHERE x.id = o.id OR x."parentId" = o.id)
    OR EXISTS (SELECT 1 FROM "Operation" op JOIN "Order" x ON x.id = op."orderId"
                WHERE (x.id = o.id OR x."parentId" = o.id) AND op."requiresPhoto"
                  AND NOT EXISTS (SELECT 1 FROM "Attachment" a
                                   WHERE a."operationId" = op.id AND a.kind = 'PHOTO'))
  )
ORDER BY o.number;
