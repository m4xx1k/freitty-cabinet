# Freitty client cabinet — handover

Everything needed to pick this up cold: what the business is, which rules the
code enforces, where each piece lives, what is done and what is not.

**Live:** https://freitty-cabinet.up.railway.app
· [`/orders`](https://freitty-cabinet.up.railway.app/orders)
· [`/api/orders/FR001383`](https://freitty-cabinet.up.railway.app/api/orders/FR001383)
· [`/api/dashboard`](https://freitty-cabinet.up.railway.app/api/dashboard)

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

## 2. Four things the mockup gets right

Each of these is a deliberate constraint, and each one has a wrong version that
looks reasonable until it costs you a rewrite.

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

**The central claim: no figure on any screen is stored in a column.**

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
and the tile would read 4 where the mockup says 3.

**Three counts live near each other and none of them are the same number**, which
is worth saying before someone asks. The tile reads **3**: every order whose next
move is the client's. Its alert bucket reads **1**: only the client-actionable
alert. The **Alerts** tab reads **2**: any order carrying any alert. The tile is
a link, so it points at a **Need Attention** tab that shares its predicate —
`needsClientAttention()` in `lib/domain/alerts.ts`, read by both — and the link
carries `period=all`, since the tile counts over every order while the list
defaults to thirty days. Pointing it at Alerts instead promised three and
delivered two: a draft has no operations and so can raise no alert, but somebody
still has to submit it.

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
app/page.tsx     the dashboard (server shell + client view)
app/orders/      the list page and the detail page, both server shell + client view
components/      Shell, OrderCard, OrdersView, DashboardView, Charts,
                 OrderDetailView
prisma/          schema, migrations, seed.ts, gate.sql
```

**The two charts are hand-drawn SVG, not a charting library.** Twelve numbers in,
one `<path>` out: no axes to negotiate, no legend, no zoom, and the mockup itself
draws them as plain `<svg>`. Recharts would ship ~100 KB to the client to
produce the same twelve rectangles. `components/Charts.tsx` takes
`{ key, value, title }[]` and knows nothing about orders or money — the caller
formats the hover text, so the chart never learns what a cent is.

**The layering, said in Nest terms.** Why there is no NestJS here: the zod schema at the edge of a route is a **Pipe**; the serialiser in
`lib/dto` that keeps `partnerCents` out is an **Interceptor**; a `companyId`
check before touching an order is a **Guard**. In Nest those are decorators, here
they are functions at the route boundary. If this grew, that layer is what moves
first, and it moves as-is. At this size a second service and a second deployment
cost more than they return.

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
shows `15 × Std + 12 × XL` and FR001668 shows `55 × Std`. The difference is the
point: in the mockup the totals are drawn by hand, in the app they are derived.

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
+ 17 tests · **E3** four REST routes + `/api/session` · **E4** shell and order
list · **E5** dashboard · **E6** order detail · **E7** polish.

**E5**, in detail: three KPI tiles (the wide Need Attention one spans two slots
and carries its own breakdown, as in the mockup), the four active orders, the two
charts with the `Day / CW / Month / Quarter` switch, and the insight strip. The
switch lives in the URL like the list's filters, so `/?period=quarter` is a link.
`pnpm lint` is clean again: the fetch effects in `DashboardView` and `OrdersView`
no longer call `setState` in the effect body — the period (or query string) the
loaded payload belongs to *is* the loading flag, so the second setState only
restated it one render later.

**E6**, in detail: the header carries both axes as neighbouring badges, the meta
grid, the dock drawn as a plan, expected / actual / warehouse note, the
operations log with a reconciliation strip under it — `Σ Unloading 12 = actual ·
− Disposal 1 = shippable 11 · BOL declared 10 → Δ +2`, which is the whole
argument of the build in one line — the supplies table, and the platform-only
totals. A consolidation gets a sub-orders table above the log, each leg with its
own declared and actual through the same `quantities()` the parent uses, and the
log gains a Leg column. Only the mockup's cross-dock detail existed to copy;
the consolidation view is the same layout extended.

Sub-order numbers are deliberately not links: only top-level orders have a page,
and the 404 copy says where to find one. The prefetch 404s the cards used to
throw are gone.

**E7**, in detail:

- **The sidebar stops being a column below 900px** and becomes a strip along the
  top. It was a 220px track of the page grid, so on a phone it did not shrink —
  it pushed the content out and the whole document scrolled sideways
  (`scrollWidth` 713 at a 390 viewport). All three pages now measure 390 at 390.
  Wide tables scroll inside their own panel; the page never does.
- **Times render in a fixed zone, never the reader's.** A slot is an appointment
  at a dock: 08:55 is when the truck was there. Left to the browser, a reviewer
  opening the link from Europe read 12:55 for the same booking. `DISPLAY_TZ` in
  `lib/format.ts` is UTC, which is the zone the seed's wall-clock times were
  written in; in production it becomes the hub's own zone, a column the schema
  does not have yet. Verified by rendering the same page under two browser
  timezones and diffing.
- **`gate.sql` states the alert rule once.** It was spelled out twice — in a
  `CASE` and again in the `WHERE` — so the gate would have kept passing while the
  two drifted apart, which is the one thing a gate exists to prevent. Both now
  read columns from a `per_order` CTE.
- **`/api/session` asks for what an alert can actually read** — declared
  quantities, the log, and whether documented operations were — and leaves the
  hub, dock, driver, staff, supplies and documents on the server. The shell calls
  it on every page load. Its scope question resolved itself in E5: the badge, the
  tile and the tab it links to now count the same set.
- **`toOrderDetail` derives `quantities` once.** The card body moved into
  `cardFrom(row, node, alerts, qty)`, which both entry points feed.
- **The "missing photo" flag sits on its own line** in the operations table.
  Inline, it stretched the Docs column and shoved the table sideways.
- **README**, and a `.env.example` that is no longer swallowed by `.gitignore`.

Not built, and never in scope: authentication and the `companyId` filter that
comes with it, the create and edit flows behind `+ New Order` and `Edit`, CSV
export, the billing screen, and uploading a photo or leaving a comment. Those
buttons are in the mockup and are inert here on purpose — the brief is a
read-side cabinet over a domain, and everything that reads is real.

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

## 11. Reading the system in three minutes

Five paths through the app, each one landing on a decision from section 2.

1. **The order is recursive.** A consolidation is the same entity with children,
   and `Ref N` lives on the leaf and aggregates upwards. → FR001676: the ref list
   on the card, then the sub-orders table on `/orders/FR001676`, whose legs add
   up to the parent's row.
2. **Quantity and money come out of the operation log.** → `/orders/FR001383`,
   the reconciliation strip under the operations table. Actual is what came off
   the truck, shippable is what leaves after damage, and the delta is measured
   against the document.
3. **An alert is a rule, not a status.** Three rules, and Need Attention is built
   from them. → the tile, then through to the list behind it, which shares its
   predicate.
4. **Price is two-layered.** Platform for the client, partner hidden. → open
   `/api/orders/FR001383`: the field is not there, and no query behind the route
   selects it.
5. **The frontend consumes real REST routes.** → `/api/dashboard` is the whole
   dashboard as JSON.
