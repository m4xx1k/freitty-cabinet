# Freitty client cabinet — handover

Everything needed to pick this up cold: what the business is, which rules the
code enforces, where each piece lives, what is done and what is not.

**Live:** https://web-production-99d64.up.railway.app
· [`/orders`](https://web-production-99d64.up.railway.app/orders)
· [`/api/orders/FR001383`](https://web-production-99d64.up.railway.app/api/orders/FR001383)
· [`/api/dashboard`](https://web-production-99d64.up.railway.app/api/dashboard)

---

## 1. The business, in one paragraph

Freitty is not a carrier. It is a **cross-dock**: a warehouse that sells
*operations on somebody else's freight*. A truck arrives at a hub, is parked at
a dock, pallets come off, something is done to them, and they go out on another
truck. Nothing is stored for months — it is *transferred across the dock*, which
is where the name comes from.

The customer of the platform is a **freight owner or broker** (in the mockup:
R-way Transport), with its own admin and dispatchers. The cabinet being built is
theirs.

**Money is charged for operations, not distance.** Unloading, disposal of
damaged pallets, restacking, loading — plus consumables (straps, corners, shrink
wrap). Every line marked `$` in the mockup is a future invoice line.

Two scenarios, and that is the entire product logic:

| Scenario | What it is | Shape |
|---|---|---|
| **Cross-Dock** | one inbound load → operations → one outbound | flat order, one `Ref N` |
| **Consolidation** | several shippers' loads combined into one trailer (cheaper than sending each separately); deconsolidation is the reverse at the far end | parent order + N sub-orders, each with its own `Ref N` and pallet count |

**Glossary.** *Order* — a job request, numbered `FR001676`. *Sub-order* —
`FR001676-2`, a leg of a consolidation. *Ref N* — the **client's own** reference
(`REF-1003`); they search by this, not by our number. *Hub* — warehouse. *Dock* —
a numbered gate, `Dock 12 · Bay B`. *BOL* — bill of lading, source of the
*declared* quantity. *Operation* — a warehouse action. *Supply* — a consumable
sold to the client. *Alert* — a computed flag, not a status.

---

## 2. The four things the mockup is testing

These are deliberate. Naming them out loud is half the interview.

1. **`Ref N` lives on the leaf, not on the order.** The card says "3 refs" —
   that is an aggregate over three sub-orders, not a field. In a cross-dock the
   leaf *is* the root, which is why it looks like a plain column there. Put
   `refNumber` on the parent and the dropdown from the mockup becomes impossible.
2. **`Alert` is not a status.** In the mockup the badge sits *next to*
   `Consolidation`, not instead of `In progress`. Add `ALERT` to the status enum
   and you lose the real status and break both the pipeline and the KPIs.
3. **Two independent axes of state.** The detail page shows `● On Stock` and
   `Loading in progress` at the same time: where the freight physically is, and
   where the order is in the workflow. Collapsing them gives either twenty
   statuses or lost information.
4. **Every price is masked as `$1`.** The tariff was cut out on purpose, and a
   comment in the markup says *"Client sees only Platform price; WP and margin
   split are hidden."* So price is two-layered and the client API must never
   return the partner side.

---

## 3. State: three axes

**Workflow — `Order.status`.** Seven values, taken from the pipeline view's seven
kanban columns:

```
DRAFT → READY → IN_PROGRESS → CONSOLIDATED → IN_TRANSIT → DECONSOLIDATED → CLOSED
```

The client moves an order only `DRAFT → READY`. Everything after that is moved by
the warehouse, through operations. Mockup badges map on top: *New* = `READY`,
*In progress* = `IN_PROGRESS`, *Completed* = `CLOSED`.

**Cargo — `Order.cargoState`.** `EXPECTED → ON_STOCK → LOADED → SHIPPED`. Follows
from the log: the first `UNLOADING` means `ON_STOCK`, the last `LOADING` means
`LOADED`.

**Alerts — computed on read, never stored.** An order can carry several at once.

| Code | Fires when | Client's move? |
|---|---|---|
| `QTY_DELTA` | counted quantity ≠ declared, once the count is complete | yes — confirm the delta |
| `MISSING_PHOTO` | an operation that requires documentation has zero photos | yes — upload it |
| `OVERDUE` | `READY`, the slot has passed, and the log is empty — the truck never came | yes — rebook |

---

## 4. Where every number on screen comes from

**The central claim: no figure on any screen is stored in a column.** This is the
first thing to say at the demo.

| Figure | Formula |
|---|---|
| Declared q-ty | `Σ CargoLine.declaredQty` over the order and all its children |
| **Actual q-ty** | `Σ Operation[UNLOADING].qty` — what came off the truck |
| **Shippable** | `Σ UNLOADING − Σ DISPOSAL` — what leaves after damage |
| Delta | `actual − declared`, and only once every leaf holding cargo has been unloaded |
| Order total | `Σ (op.qty × PriceRule.platformCents)` for billable operations `+ Σ (supply.qty × supply.unitPriceCents)` |

**Actual and shippable are not the same number, and this is the single easiest
thing to get wrong.** On FR001383: BOL says 10, the floor counted 12, one pallet
was damaged and disposed of, 11 were restacked and loaded. The screen shows
**Actual 12** with **Δ +2** — against the BOL, not against what shipped. Compute
actual as `12 − 1 = 11` and the badge silently becomes `Δ +1`, which is the wrong
story: the delta is a discrepancy with the *document*, and disposal is a separate
event that happened afterwards.

The delta is also held back while a count is in progress. Half-unloaded, a
consolidation declaring 9 + 6 + 12 with only the first leg off the trailer would
otherwise report `Δ −18` and raise an alert on a perfectly healthy order.

**Dashboard KPIs**

| Tile | Query |
|---|---|
| Active Orders `7` | `count(status ∈ READY, IN_PROGRESS, CONSOLIDATED, IN_TRANSIT)` |
| ▲ `2` this week | of those, created in the last 7 days |
| Completed (30 d) `24` | `count(status = CLOSED AND closedAt ≥ now − 30d)` |
| Need Attention `3` | `awaitingAction (2) + activeAlerts (1)` |
| charts | orders and spend bucketed by the `Day / CW / Month / Quarter` switch |

**Need Attention counts each order once**, in exactly one bucket: an order with a
client-actionable alert goes to `activeAlerts`, otherwise a draft or an
unconfirmed delta or an overdue truck goes to `awaitingAction`. Without that rule
FR001674 — which has *both* a delta and a missing photo — would be counted twice
and the tile would read 4 where the mockup says 3. Note the Alerts **tab** counts
2 (any order with any alert) while the tile's alert bucket counts 1 (only the
client-actionable one); these measure different things on purpose.

---

## 5. Data model

Fourteen tables. `prisma/schema.prisma` is commented; the shape:

```
Company ─┬─ User (ADMIN | DISPATCHER | DRIVER | FLOOR_LEAD)
         └─ Order ──┬── Order (children, via parentId)   ← consolidation
                    ├── CargoLine     what the BOL declares
                    ├── Operation ──┬── Attachment       the warehouse log
                    │               └── Comment
                    ├── Supply → Sku  consumables sold
                    ├── Attachment    BOL, docs
                    └── OrderEvent    status history
Hub ─┬─ Dock
     ├─ PriceRule   tariff per hub × operation × pallet type
     └─ User        floor staff belong to a hub, not a company
```

**Three decisions to be able to defend:**

1. **Self-relation `parentId`, not a separate `SubOrder` table.** Cross-dock and
   consolidation are one entity at different depths. A child's number is
   `parent.number + "-" + index`. One set of queries serves both scenarios, and
   deconsolidation becomes another level with no new tables.
2. **Quantities and money are not stored.** `Operation` is the source of truth.
   No drift between a column and the log, the history of a discrepancy is always
   reconstructable, and "where did 18 come from" is answered by a table on screen.
3. **Price in the database, in two columns, per hub.** Tariffs change; hardcoding
   makes every old invoice wrong. `Supply.unitPriceCents` copies the price at the
   moment the line is added, so an issued invoice does not drift.
   `PriceRule.hubId` is **required**: a nullable "applies everywhere" column
   cannot be constrained, because Postgres treats NULLs as distinct and two
   global tariffs for the same operation would both insert, leaving the lookup to
   pick whichever row came back first.

`partnerCents` exists on `PriceRule` and `Sku` and **never leaves the server**:
no DTO has the field and no query behind one selects it. It is absent by
construction, not filtered out at the end. `grep -i partner` over any API
response returns nothing.

---

## 6. Code map

```
lib/domain/      pure functions — the whole domain, no database in sight
  types.ts       plain shapes (OrderNode) the functions work on + walk()
  quantities.ts  quantities(), trailerCount(), refNumbers()
  alerts.ts      alertsFor(), needAttention()
  pricing.ts     priceOf(), billedLines(), orderTotals()
  nextAction.ts  the "Next: …" line in every card footer
  domain.test.ts 16 unit tests, fixtures built by hand

lib/services/    load rows, map them into domain shapes
  orders.ts      orderInclude, toNode(), loadOrder(), loadPriceRules()
  list.ts        listQuery (zod) + listOrders() with tab counts
  dashboard.ts   dashboardQuery (zod) + getDashboard()

lib/dto/order.ts the only place a row becomes a response body
lib/db/prisma.ts one client per process, through the pg driver adapter
lib/format.ts    dates, money, unit labels, status labels, avatar colours

app/api/…        route handlers: zod on the way in, DTO on the way out
app/orders/      the list page (server shell + client view)
components/      Shell, OrderCard, OrdersView
prisma/          schema, migrations, seed.ts, gate.sql
```

**The layering, said in Nest terms** — this is the prepared answer for "why not
NestJS": the zod schema at the edge of a route is a **Pipe**; the serialiser in
`lib/dto` that keeps `partnerCents` out is an **Interceptor**; a `companyId`
check before touching an order is a **Guard**. In Nest those are decorators, here
they are functions at the route boundary. If this grew, that layer is what moves
first, and it moves as-is. On a one-day task a second deployment costs more than
it returns — especially since the brief says the source code is not submitted and
only the deployed app and the presentation are assessed.

---

## 7. Invariants — do not break these

- Only **top-level** orders are listed; sub-orders appear inside their parent.
- A **consolidation parent carries no cargo of its own** — no `CargoLine`, no
  operations. Its numbers are the sum of its children's. Break this and the
  parent's own cargo double-counts against the children's operations, producing a
  phantom delta.
- Anything derivable is **computed on read**. If you find yourself adding a
  `totalQty` column, that is the mistake this project is built to avoid.
- The **client API never returns partner pricing**. Adding a field to a DTO is
  the only way to break this; keep it that way.
- `Order.number` is unique and human-facing; a child is `${parent}-${n}`.
- Filters live in the **URL**, so any filtered view is a link.

---

## 8. Seed, and why the mockup's own numbers do not add up

The wireframe contradicts itself in four places. This was found by adding it up,
and the resolution matters more than the arithmetic:

| Where | Drawn | Problem |
|---|---|---|
| FR001676 | children 9 · 6 · 12, card "15 × Std + 3 × XL" | sum is 27, card says 18 |
| FR001668 | children 15 · 8 · 20 · 12, card "28 × Std" | sum is 55 |
| Tabs | All 27 · Cross-Dock 18 · Consolidation 6 | 18 + 6 = 24 |
| KPI vs tabs | Active 7 + Completed 24 + Draft 1 | = 32 orders, list claims 27 |

**One rule resolves all of it:** sub-order lines and the operation log are taken
from the mockup verbatim; every aggregate above them is computed. So FR001676
shows `15 × Std + 12 × XL` and FR001668 shows `55 × Std`. That is not a mismatch
to apologise for — it is the demonstration: in the mockup the totals are drawn by
hand, in the app they are derived.

One exception: **FR001674**, where the declared/actual pair *is* the alert story.
Its magnitude is preserved (Δ −2) rather than its absolute numbers: children
declare 11 + 7 = 18, and 10 + 6 = 16 were unloaded.

Tabs and KPIs are reconciled through the list's default filter, which the mockup
already shows: **Date: Last 30 days**. 32 orders inside the window, 85 in the
database — 20 closed in the previous 30 days so "vs previous month" is real, plus
a quarter of history so the period switch never hits an empty chart.

Dates are relative to the moment of seeding, not pinned to April, so
`Completed (30 d)` is still true whenever the reviewer opens the link.

**`pnpm db:gate`** runs `prisma/gate.sql` and checks the seed still produces the
mockup's numbers: `7 · ▲2 · 24 · 20`, tabs `32 / 26 / 6 / 1`, FR001383 at
`10 declared · 12 actual · Δ +2 · 11 shippable`, and exactly two alerting orders.
Run it after touching the seed. If a number drifts, **fix the seed, not the
formula.**

---

## 9. State of play

Done: **E0** scaffold deployed · **E1** schema, migrations, seed · **E2** domain
+ 16 tests · **E3** four REST routes + `/api/session` · **E4** shell and order
list.

Left:

- **E5 — Dashboard** (`app/page.tsx` is a placeholder). Four KPI tiles, the wide
  Need Attention tile with its breakdown, two Recharts charts, the
  `Day / CW / Month / Quarter` switch, the insight strip. `/api/dashboard`
  already returns everything it needs.
- **E6 — Order detail** (`app/orders/[number]/page.tsx` does not exist; cards
  already link to it, so every card 404s and Next's prefetch fills the console
  with 404s — this disappears the moment the page lands). Show FR001383 in full
  and FR001676 for the ref list.
- **E7 — polish**: mobile is broken (`scrollWidth` 713 at a 390 viewport — the
  220px sidebar never collapses); dates render in the browser's timezone, so a
  reviewer abroad sees shifted hours; `gate.sql` duplicates its alert condition
  between `CASE` and `WHERE`; `/api/session` counts attention over the whole
  database while the Alerts tab is scoped to 30 days, and it is a full deep query
  on every page load; `toOrderDetail` computes `quantities` twice. Plus loading
  and empty states, 404 page, and a half-page README.

## 10. Commands

```bash
pnpm dev            # local, reads .env → Railway Postgres over its public proxy
pnpm build          # prisma generate && next build
pnpm test           # vitest, 16 domain tests
pnpm db:migrate     # prisma migrate dev && prisma generate  (migrate alone does NOT regenerate)
pnpm db:seed        # rebuild the database from prisma/seed.ts
pnpm db:gate        # do the mockup's numbers still come out?
railway up --service web --ci   # deploy (no GitHub hookup yet, so this is manual)
```

Infrastructure: Railway project `freitty-cabinet`, services `web` and `Postgres`,
one `production` environment. The app reads `DATABASE_URL` as
`${{Postgres.DATABASE_URL}}` over the private network; local work goes through
the public TCP proxy in `.env`. Two traps already paid for: a route with
`revalidate` gets prerendered at build time and cannot reach the private network
(keep DB-touching routes `force-dynamic`), and Prisma 7 requires a driver adapter
— `new PrismaClient()` with no arguments does not compile.

## 11. Three minutes of demo

1. *"The order is recursive. A consolidation is the same order with children, and
   Ref N lives on the leaf and aggregates upwards."* → FR001676 with the ref list
   open.
2. *"Quantity and money are not stored, they come out of the operation log. Here
   is the delta, and here is where it came from."* → the operations table next to
   `Δ +2`. Add: actual is what came off the truck, shippable is what leaves.
3. *"An alert is a rule, not a status. Three rules, and Need Attention is built
   from them."* → the tile, then click through to the filtered list.
4. *"Prices are masked as $1 in the mockup, so the tariff is two-layered:
   platform for the client, partner hidden — the API does not return it at all."*
   → open `/api/orders/FR001383`, the field simply is not there.
5. *"The backend is real REST routes and the frontend consumes them with fetch."*
   → open `/api/dashboard` in the next tab.
6. *"No Nest here on purpose: on a one-day task a second deployment costs more
   than it returns, and the code is not even submitted. The layers are the same —
   zod instead of a Pipe, a serialiser instead of an Interceptor, a company check
   instead of a Guard. If it grows, that layer moves first."*

If the mockup's arithmetic comes up, the answer is section 8: the totals in the
wireframe were drawn by hand and do not reconcile, so the seed takes the leaves
as truth and derives everything above them — which is exactly what the app does
at runtime.
