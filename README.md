# Freitty — client cabinet

A client cabinet for a **cross-dock**: a warehouse that sells *operations on
somebody else's freight*. A truck arrives at a hub, is parked at a dock, pallets
come off, something is done to them, and they go out on another truck. The money
is charged for the operations, not for distance.

**Live:** https://web-production-99d64.up.railway.app

| | |
|---|---|
| [`/`](https://web-production-99d64.up.railway.app/) | dashboard — KPIs, activity charts, the orders that need you |
| [`/orders`](https://web-production-99d64.up.railway.app/orders) | the list, filtered through the URL |
| [`/orders/FR001383`](https://web-production-99d64.up.railway.app/orders/FR001383) | a cross-dock in full, with the operations log the numbers come from |
| [`/orders/FR001676`](https://web-production-99d64.up.railway.app/orders/FR001676) | a consolidation, three legs adding up to the parent |
| [`/api/dashboard`](https://web-production-99d64.up.railway.app/api/dashboard) | the JSON behind the dashboard |

## The one idea

**No figure on any screen is stored in a column.** Quantities and money are
derived from the operation log every time they are read.

`FR001383` is the example: the BOL declares 10 pallets, the floor counted 12, one
was damaged and disposed of, 11 were restacked and loaded. The page shows
**actual 12**, **Δ +2** and **shippable 11** — because actual is what came off
the truck, the delta is a discrepancy with the *document*, and disposal is a
separate event that happened afterwards. Store any of those three and they start
to drift; derive them and "where did 12 come from" is answered by the table
directly underneath.

Two more rules follow from it. An **alert** is computed on read and sits *beside*
a status, never instead of one. And state has **two independent axes** — where
the freight physically is (`On Stock`) and where the order is in the workflow
(`In progress`) — which is why both badges appear in the header at once.

Prices are two-layered: the client sees the platform price, and what the partner
is paid never leaves the server. No DTO has the field and no query behind one
selects it.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 over Postgres ·
zod at every route boundary · vitest. Deployed on Railway.

The layering, in Nest terms: the zod schema at the edge of a route is a **Pipe**,
the serialiser in `lib/dto` that keeps the partner price out is an
**Interceptor**, a company check before touching an order is a **Guard**. Here
they are functions at the route boundary rather than decorators. If this grew,
that layer is what moves first, and it moves as-is.

```
lib/domain/    pure functions — the whole domain, no database in sight
lib/services/  load rows, map them into domain shapes
lib/dto/       the only place a row becomes a response body
app/api/       route handlers: zod on the way in, a DTO on the way out
components/    Shell, OrderCard, OrdersView, DashboardView, OrderDetailView, Charts
prisma/        schema, migrations, seed.ts, gate.sql
```

## Running it

```bash
pnpm install
cp .env.example .env      # DATABASE_URL for a Postgres you can reach
pnpm db:migrate           # migrate + regenerate the client
pnpm db:seed              # build the demo dataset
pnpm dev                  # http://localhost:3000
```

| Command | |
|---|---|
| `pnpm test` | 17 domain unit tests, no database |
| `pnpm db:gate` | does the seed still produce the numbers the mockup shows? |
| `pnpm build` | `prisma generate && next build` |

`pnpm db:gate` is the interesting one. It re-derives the dashboard KPIs, the tab
counts, `FR001383`'s quantities and the alert set straight from SQL and prints
them next to the values they are supposed to equal. Run it after touching the
seed — and if a number drifts, **fix the seed, not the formula**.

`HANDOVER.md` has the rest: the business, every derived number and its formula,
the invariants, why the wireframe's own arithmetic does not reconcile, and what
is still left to build.
