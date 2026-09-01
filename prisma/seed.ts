import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// The wireframe's own numbers do not reconcile (see README): a card's Q-ty is
// not the sum of its sub-orders, and the tab counts contradict the KPI tiles.
// The seed resolves that with one rule, applied everywhere:
//
//   sub-order lines and the operation log are taken from the mockup verbatim,
//   every aggregate above them is computed.
//
// Everything is dated relative to the moment of seeding, so "Completed (30 d)"
// and the charts stay true whenever the reviewer opens the app.

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NOW = new Date();

function at(daysAgo: number, hours = 9, minutes = 0): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Deterministic PRNG so a re-seed produces the same database.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(1383);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

async function main() {
  // ── wipe, children before parents ───────────────────────────────────────
  await prisma.orderEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.supply.deleteMany();
  await prisma.operation.deleteMany();
  await prisma.cargoLine.deleteMany();
  await prisma.order.deleteMany({ where: { parentId: { not: null } } });
  await prisma.order.deleteMany();
  await prisma.priceRule.deleteMany();
  await prisma.sku.deleteMany();
  await prisma.dock.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hub.deleteMany();
  await prisma.company.deleteMany();

  // ── tenant ──────────────────────────────────────────────────────────────
  const company = await prisma.company.create({
    data: { name: "R-way Transport", balanceCents: 128_450 },
  });

  const markham = await prisma.hub.create({
    data: {
      name: "Markham",
      city: "Markham",
      province: "ON",
      docks: {
        create: [
          { code: "Dock 11", bay: "A" },
          { code: "Dock 12", bay: "B" },
          { code: "Dock 13", bay: "C" },
        ],
      },
    },
    include: { docks: true },
  });

  const toronto = await prisma.hub.create({
    data: {
      name: "Toronto",
      city: "Toronto",
      province: "ON",
      docks: { create: [{ code: "Dock 1", bay: "A" }, { code: "Dock 2", bay: "B" }] },
    },
    include: { docks: true },
  });

  const dock12 = markham.docks.find((d) => d.code === "Dock 12")!;

  const mkUser = (name: string, initials: string, role: "ADMIN" | "DISPATCHER" | "DRIVER") =>
    prisma.user.create({ data: { name, initials, role, companyId: company.id } });

  const u1 = await mkUser("User 1", "U1", "ADMIN");
  const u2 = await mkUser("User 2", "U2", "DISPATCHER");
  const u3 = await mkUser("User 3", "U3", "DISPATCHER");
  const u4 = await mkUser("User 4", "U4", "DISPATCHER");
  const u5 = await mkUser("User 5", "U5", "DRIVER");
  const u6 = await prisma.user.create({
    data: { name: "User 6", initials: "U6", role: "FLOOR_LEAD", hubId: markham.id },
  });

  // ── price book ──────────────────────────────────────────────────────────
  // The mockup masks every amount as $1, so the tariff is invented — but it
  // lives in the database, and the client only ever sees platformCents.
  await prisma.priceRule.createMany({
    data: [
      { operationKind: "UNLOADING", unitType: "STANDARD_48X40", platformCents: 450, partnerCents: 300 },
      { operationKind: "UNLOADING", unitType: "XL", platformCents: 650, partnerCents: 430 },
      { operationKind: "LOADING", unitType: "STANDARD_48X40", platformCents: 400, partnerCents: 265 },
      { operationKind: "LOADING", unitType: "XL", platformCents: 600, partnerCents: 400 },
      { operationKind: "DISPOSAL", unitType: "STANDARD_48X40", platformCents: 1200, partnerCents: 800 },
      { operationKind: "DISPOSAL", unitType: "XL", platformCents: 1800, partnerCents: 1200 },
      { operationKind: "RESTACK", unitType: "STANDARD_48X40", platformCents: 350, partnerCents: 230 },
      { operationKind: "RESTACK", unitType: "XL", platformCents: 500, partnerCents: 330 },
      { operationKind: "STORAGE", unitType: "STANDARD_48X40", platformCents: 200, partnerCents: 130 },
      { operationKind: "STORAGE", unitType: "XL", platformCents: 300, partnerCents: 200 },
    ],
  });

  const skuRows = [
    { code: "Straps 12", category: "SECUREMENT" as const, platformCents: 320, partnerCents: 210 },
    { code: "Corners 50", category: "EDGE_PROTECT" as const, platformCents: 85, partnerCents: 55 },
    { code: "Shrink wrap 120g", category: "WRAP" as const, platformCents: 740, partnerCents: 490 },
    { code: "Load bar", category: "SECUREMENT" as const, platformCents: 1450, partnerCents: 960 },
    { code: "Edge board 48", category: "EDGE_PROTECT" as const, platformCents: 120, partnerCents: 80 },
    { code: "Stretch film 80g", category: "WRAP" as const, platformCents: 560, partnerCents: 370 },
  ];
  await prisma.sku.createMany({ data: skuRows });
  const skus = Object.fromEntries((await prisma.sku.findMany()).map((s) => [s.code, s]));

  // ── FR001383 · the showcase order from the detail screen ────────────────
  const fr1383 = await prisma.order.create({
    data: {
      number: "FR001383",
      companyId: company.id,
      createdById: u2.id,
      type: "CROSS_DOCK",
      services: ["TRANSLOAD", "RESTOCK_REWORK"],
      status: "IN_PROGRESS",
      cargoState: "ON_STOCK",
      refNumber: "REF-1012",
      hubId: markham.id,
      dockId: dock12.id,
      dockAssignedAt: at(0, 8, 42),
      scheduledAt: at(0, 8, 0),
      carrierType: "COMPANY",
      carrierName: "R-way Transport Inc.",
      carrierPhone: "+1 647 555 0199",
      assignedToId: u6.id,
      truckNo: "TRK-4521",
      trailerNo: "TRL-8830",
      trailerType: "Van · 53ft",
      warehouseNote:
        "Counted 12 pallets on arrival, BOL says 10. 1 pallet damaged → routed to Disposal.",
      createdAt: at(9, 16, 20),
      cargoLines: { create: [{ unitType: "STANDARD_48X40", declaredQty: 10 }] },
    },
  });

  // Unloading 12 → Disposal 1 → Restack 11 → Loading 11.
  // Actual on the screen is what came off the truck (12), not what leaves (11).
  const ops1383 = [
    { kind: "UNLOADING" as const, qty: 12, minutes: 55, billable: true, photos: 4, comments: 0 },
    { kind: "DISPOSAL" as const, qty: 1, minutes: 70, billable: true, photos: 2, comments: 1 },
    { kind: "RESTACK" as const, qty: 11, minutes: 85, billable: false, photos: 1, comments: 0 },
    { kind: "LOADING" as const, qty: 11, minutes: 160, billable: true, photos: 0, comments: 0 },
  ];

  for (const op of ops1383) {
    const created = await prisma.operation.create({
      data: {
        orderId: fr1383.id,
        kind: op.kind,
        qty: op.qty,
        unitType: "STANDARD_48X40",
        trailerNo: op.kind === "UNLOADING" || op.kind === "LOADING" ? "TRL-8830" : null,
        appliedAt: at(0, 8, op.minutes),
        billable: op.billable,
        requiresPhoto: op.kind === "UNLOADING" || op.kind === "DISPOSAL",
      },
    });
    for (let i = 0; i < op.photos; i++) {
      await prisma.attachment.create({
        data: { kind: "PHOTO", url: `/uploads/${created.id}-${i + 1}.jpg`, operationId: created.id },
      });
    }
    if (op.comments) {
      await prisma.comment.create({
        data: {
          orderId: fr1383.id,
          operationId: created.id,
          authorId: u6.id,
          body: "Pallet 7 shrink-wrap torn, corner crushed. Photos attached.",
        },
      });
    }
  }

  for (const [code, qty] of [["Straps 12", 4], ["Corners 50", 16], ["Shrink wrap 120g", 2]] as const) {
    await prisma.supply.create({
      data: {
        orderId: fr1383.id,
        skuId: skus[code].id,
        qty,
        unitPriceCents: skus[code].platformCents,
      },
    });
  }

  await prisma.attachment.create({
    data: { kind: "BOL", url: "/uploads/FR001383-bol.pdf", orderId: fr1383.id },
  });

  // ── FR001676 · consolidation with three sub-orders ──────────────────────
  const fr1676 = await prisma.order.create({
    data: {
      number: "FR001676",
      companyId: company.id,
      createdById: u1.id,
      type: "CONSOLIDATION",
      services: [],
      status: "IN_PROGRESS",
      cargoState: "ON_STOCK",
      hubId: markham.id,
      destCity: "Toronto",
      destProvince: "ON",
      scheduledAt: at(5, 9, 0),
      carrierType: "OWN_DRIVER",
      driverId: u5.id,
      trailerType: "Van · 53ft",
      createdAt: at(9, 11, 0),
    },
  });

  // Ref numbers and pallet counts exactly as drawn in the ref list.
  const kids1676 = [
    { n: 1, ref: "REF-1001", qty: 9, unit: "STANDARD_48X40" as const, trailer: "TRL-8830" },
    { n: 2, ref: "REF-1003", qty: 6, unit: "STANDARD_48X40" as const, trailer: "TRL-8830" },
    { n: 3, ref: "REF-1002", qty: 12, unit: "XL" as const, trailer: "TRL-9041" },
  ];

  for (const kid of kids1676) {
    const child = await prisma.order.create({
      data: {
        number: `FR001676-${kid.n}`,
        parentId: fr1676.id,
        companyId: company.id,
        createdById: u1.id,
        type: "CONSOLIDATION",
        status: "IN_PROGRESS",
        cargoState: "ON_STOCK",
        refNumber: kid.ref,
        hubId: markham.id,
        scheduledAt: at(5, 9, 0),
        createdAt: at(9, 11, 0),
        cargoLines: { create: [{ unitType: kid.unit, declaredQty: kid.qty }] },
      },
    });
    const unloading = await prisma.operation.create({
      data: {
        orderId: child.id,
        kind: "UNLOADING",
        qty: kid.qty,
        unitType: kid.unit,
        trailerNo: kid.trailer,
        appliedAt: at(5, 10, kid.n * 20),
        billable: true,
        requiresPhoto: true,
      },
    });
    await prisma.attachment.create({
      data: { kind: "PHOTO", url: `/uploads/${unloading.id}-1.jpg`, operationId: unloading.id },
    });
  }

  // ── FR001674 · consolidation carrying both alerts ───────────────────────
  const fr1674 = await prisma.order.create({
    data: {
      number: "FR001674",
      companyId: company.id,
      createdById: u3.id,
      type: "CONSOLIDATION",
      services: [],
      status: "IN_PROGRESS",
      cargoState: "ON_STOCK",
      hubId: markham.id,
      destCity: "Calgary",
      destProvince: "AB",
      scheduledAt: at(4, 11, 0),
      carrierType: "COMPANY",
      carrierName: "TForce",
      trailerType: "Van · 53ft",
      createdAt: at(8, 15, 30),
    },
  });

  // Declared 11 + 7 = 18, unloaded 10 + 6 = 16 → delta −2, same magnitude the
  // mockup draws. The second sub-order's unloading has no photo → MISSING_PHOTO.
  const kids1674 = [
    { n: 1, ref: "REF-1005", declared: 11, unloaded: 10, photos: 2 },
    { n: 2, ref: "REF-1006", declared: 7, unloaded: 6, photos: 0 },
  ];

  for (const kid of kids1674) {
    const child = await prisma.order.create({
      data: {
        number: `FR001674-${kid.n}`,
        parentId: fr1674.id,
        companyId: company.id,
        createdById: u3.id,
        type: "CONSOLIDATION",
        status: "IN_PROGRESS",
        cargoState: "ON_STOCK",
        refNumber: kid.ref,
        hubId: markham.id,
        scheduledAt: at(4, 11, 0),
        createdAt: at(8, 15, 30),
        cargoLines: { create: [{ unitType: "STANDARD_48X40", declaredQty: kid.declared }] },
      },
    });
    const unloading = await prisma.operation.create({
      data: {
        orderId: child.id,
        kind: "UNLOADING",
        qty: kid.unloaded,
        unitType: "STANDARD_48X40",
        trailerNo: "TRL-7712",
        appliedAt: at(4, 12, kid.n * 25),
        billable: true,
        requiresPhoto: true,
      },
    });
    for (let i = 0; i < kid.photos; i++) {
      await prisma.attachment.create({
        data: { kind: "PHOTO", url: `/uploads/${unloading.id}-${i + 1}.jpg`, operationId: unloading.id },
      });
    }
  }

  // ── the rest of the named cards ─────────────────────────────────────────
  await prisma.order.create({
    data: {
      number: "FR001681",
      companyId: company.id,
      createdById: u2.id,
      type: "CROSS_DOCK",
      services: ["STORAGE"],
      status: "READY",
      cargoState: "EXPECTED",
      refNumber: "REF-1004",
      hubId: toronto.id,
      destCity: "Detroit",
      destProvince: "MI",
      destNote: "via External PDF",
      scheduledAt: at(-3, 14, 0),
      carrierType: "COMPANY",
      carrierName: "Schneider",
      trailerType: "Van · 53ft",
      createdAt: at(2, 10, 15),
      cargoLines: { create: [{ unitType: "STANDARD_48X40", declaredQty: 23 }] },
    },
  });

  const fr1672 = await prisma.order.create({
    data: {
      number: "FR001672",
      companyId: company.id,
      createdById: u1.id,
      type: "CROSS_DOCK",
      services: ["PICKUP"],
      status: "CLOSED",
      cargoState: "SHIPPED",
      refNumber: "REF-1007",
      hubId: markham.id,
      destCity: "Brampton",
      destProvince: "ON",
      destNote: "Order with photos",
      scheduledAt: at(3, 17, 30),
      closedAt: at(2, 12, 0),
      carrierType: "SELF_PICKUP",
      createdAt: at(6, 9, 45),
      cargoLines: { create: [{ unitType: "XL", declaredQty: 10 }] },
    },
  });
  await prisma.operation.createMany({
    data: [
      { orderId: fr1672.id, kind: "UNLOADING", qty: 10, unitType: "XL", appliedAt: at(3, 18, 5), billable: true, requiresPhoto: true },
      { orderId: fr1672.id, kind: "LOADING", qty: 10, unitType: "XL", appliedAt: at(2, 11, 30), billable: true, requiresPhoto: false },
    ],
  });
  for (const op of await prisma.operation.findMany({ where: { orderId: fr1672.id } })) {
    await prisma.attachment.create({
      data: { kind: "PHOTO", url: `/uploads/${op.id}-1.jpg`, operationId: op.id },
    });
  }

  const fr1668 = await prisma.order.create({
    data: {
      number: "FR001668",
      companyId: company.id,
      createdById: u4.id,
      type: "CONSOLIDATION",
      services: [],
      status: "CLOSED",
      cargoState: "SHIPPED",
      hubId: markham.id,
      destCity: "Toronto",
      destProvince: "ON",
      scheduledAt: at(6, 8, 0),
      closedAt: at(5, 16, 0),
      carrierType: "COMPANY",
      carrierName: "TForce",
      trailerType: "Van · 53ft",
      createdAt: at(11, 13, 0),
    },
  });

  const kids1668 = [
    { n: 1, ref: "REF-1008", qty: 15 },
    { n: 2, ref: "REF-1009", qty: 8 },
    { n: 3, ref: "REF-1010", qty: 20 },
    { n: 4, ref: "REF-1011", qty: 12 },
  ];
  for (const kid of kids1668) {
    const child = await prisma.order.create({
      data: {
        number: `FR001668-${kid.n}`,
        parentId: fr1668.id,
        companyId: company.id,
        createdById: u4.id,
        type: "CONSOLIDATION",
        status: "CLOSED",
        cargoState: "SHIPPED",
        refNumber: kid.ref,
        hubId: markham.id,
        scheduledAt: at(6, 8, 0),
        closedAt: at(5, 16, 0),
        createdAt: at(11, 13, 0),
        cargoLines: { create: [{ unitType: "STANDARD_48X40", declaredQty: kid.qty }] },
      },
    });
    await prisma.operation.createMany({
      data: [
        { orderId: child.id, kind: "UNLOADING", qty: kid.qty, unitType: "STANDARD_48X40", trailerNo: "TRL-6620", appliedAt: at(6, 9, kid.n * 15), billable: true, requiresPhoto: false },
        { orderId: child.id, kind: "LOADING", qty: kid.qty, unitType: "STANDARD_48X40", trailerNo: "TRL-6620", appliedAt: at(5, 14, kid.n * 15), billable: true, requiresPhoto: false },
      ],
    });
  }

  await prisma.order.create({
    data: {
      number: "DRAFT-003",
      companyId: company.id,
      createdById: u1.id,
      type: "CONSOLIDATION",
      services: [],
      status: "DRAFT",
      cargoState: "EXPECTED",
      hubId: markham.id,
      scheduledAt: at(-1, 10, 0),
      createdAt: at(1, 18, 40),
    },
  });

  // ── filler, so every derived number on the dashboard is real ────────────
  //
  // Target inside the last 30 days: 7 active (4 named + 3 here), 24 closed
  // (2 named + 22 here), 1 draft. Six of the 32 are consolidations.
  // Days 31–60 carry 20 closed orders so the month-over-month figure is real,
  // and days 61–90 keep the quarter view from starting at zero.

  const carriers = ["Schneider", "TForce", "Day & Ross", "Titanium"] as const;
  const cities = [
    ["Toronto", "ON"], ["Hamilton", "ON"], ["Windsor", "ON"],
    ["Buffalo", "NY"], ["Detroit", "MI"], ["Montreal", "QC"],
  ] as const;
  const dispatchers = [u1, u2, u3, u4];

  let seq = 1700;

  async function filler(opts: {
    status: "READY" | "CONSOLIDATED" | "IN_TRANSIT" | "CLOSED";
    type: "CROSS_DOCK" | "CONSOLIDATION";
    scheduledDaysAgo: number;
    closedDaysAgo?: number;
    createdDaysAgo: number;
  }) {
    const [city, province] = pick(cities);
    const author = pick(dispatchers);
    const hub = rand() < 0.7 ? markham : toronto;
    const qty = between(4, 26);
    const unit = rand() < 0.8 ? ("STANDARD_48X40" as const) : ("XL" as const);
    seq += between(1, 3);

    const isConsolidation = opts.type === "CONSOLIDATION";
    const cargoState =
      opts.status === "CLOSED" ? "SHIPPED" : opts.status === "READY" ? "EXPECTED" : "ON_STOCK";

    const common = {
      companyId: company.id,
      createdById: author.id,
      type: opts.type,
      status: opts.status,
      cargoState,
      hubId: hub.id,
      scheduledAt: at(opts.scheduledDaysAgo, between(7, 18), 0),
      closedAt: opts.closedDaysAgo === undefined ? null : at(opts.closedDaysAgo, between(9, 19), 0),
      createdAt: at(opts.createdDaysAgo, between(8, 19), 0),
    } as const;

    const order = await prisma.order.create({
      data: {
        ...common,
        number: `FR00${seq}`,
        services: rand() < 0.3 ? ["STORAGE"] : [],
        // A consolidation carries no cargo of its own: the pallets belong to its
        // sub-orders, and the parent's numbers are the sum of theirs.
        refNumber: isConsolidation ? null : `REF-${1100 + seq - 1700}`,
        destCity: city,
        destProvince: province,
        carrierType: "COMPANY",
        carrierName: pick(carriers),
        trailerType: "Van · 53ft",
        ...(isConsolidation ? {} : { cargoLines: { create: [{ unitType: unit, declaredQty: qty }] } }),
      },
    });

    // Where the cargo actually sits: the order itself, or each sub-order.
    const cargoHolders: { id: string; qty: number }[] = [];

    if (isConsolidation) {
      const split = [Math.ceil(qty / 2), Math.floor(qty / 2)];
      for (const [i, part] of split.entries()) {
        const child = await prisma.order.create({
          data: {
            ...common,
            number: `FR00${seq}-${i + 1}`,
            parentId: order.id,
            refNumber: `REF-${1100 + seq - 1700}-${i + 1}`,
            cargoLines: { create: [{ unitType: unit, declaredQty: part }] },
          },
        });
        cargoHolders.push({ id: child.id, qty: part });
      }
    } else {
      cargoHolders.push({ id: order.id, qty });
    }

    const trailer = `TRL-${between(6000, 8999)}`;
    for (const holder of cargoHolders) {
      await prisma.operation.create({
        data: {
          orderId: holder.id,
          kind: "UNLOADING",
          qty: holder.qty,
          unitType: unit,
          trailerNo: trailer,
          appliedAt: at(opts.scheduledDaysAgo, between(8, 19), 0),
          billable: true,
          requiresPhoto: false,
        },
      });
      if (opts.status === "CLOSED") {
        await prisma.operation.create({
          data: {
            orderId: holder.id,
            kind: "LOADING",
            qty: holder.qty,
            unitType: unit,
            trailerNo: trailer,
            appliedAt: at(opts.closedDaysAgo!, between(9, 19), 0),
            billable: true,
            requiresPhoto: false,
          },
        });
      }
    }

    if (opts.status === "CLOSED" && rand() < 0.4) {
      const sku = pick(skuRows);
      await prisma.supply.create({
        data: {
          orderId: order.id,
          skuId: skus[sku.code].id,
          qty: between(1, 12),
          unitPriceCents: sku.platformCents,
        },
      });
    }
    return order;
  }

  // three more active orders, two of them created inside the last 7 days
  // so the "▲ 2 this week" trend on the Active tile is real
  await filler({ status: "READY", type: "CROSS_DOCK", scheduledDaysAgo: -2, createdDaysAgo: 3 });
  await filler({ status: "CONSOLIDATED", type: "CONSOLIDATION", scheduledDaysAgo: 1, createdDaysAgo: 12 });
  await filler({ status: "IN_TRANSIT", type: "CROSS_DOCK", scheduledDaysAgo: 2, createdDaysAgo: 14 });

  // 22 closed inside the last 30 days, weighted towards the middle weeks so the
  // bar chart has a peak instead of a flat line. One is a consolidation, which
  // brings the Consolidation tab to exactly six inside the window.
  const closedRecent = [
    3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 25, 26, 27, 29,
  ];
  for (const [i, day] of closedRecent.entries()) {
    await filler({
      status: "CLOSED",
      type: i < 1 ? "CONSOLIDATION" : "CROSS_DOCK",
      scheduledDaysAgo: day + 1,
      closedDaysAgo: day,
      createdDaysAgo: day + between(3, 8),
    });
  }

  // previous 30-day window: 20 closed → this month reads as a real increase
  for (let i = 0; i < 20; i++) {
    const day = 31 + Math.floor((i / 20) * 29);
    await filler({
      status: "CLOSED",
      type: i < 2 ? "CONSOLIDATION" : "CROSS_DOCK",
      scheduledDaysAgo: day + 1,
      closedDaysAgo: day,
      createdDaysAgo: day + between(3, 8),
    });
  }

  // the quarter before that, so Day/CW/Month/Quarter all have something to show
  for (let i = 0; i < 16; i++) {
    const day = 61 + Math.floor((i / 16) * 29);
    await filler({
      status: "CLOSED",
      type: "CROSS_DOCK",
      scheduledDaysAgo: day + 1,
      closedDaysAgo: day,
      createdDaysAgo: day + between(3, 8),
    });
  }

  // ── status history for the named orders ─────────────────────────────────
  for (const [orderId, actorId] of [
    [fr1383.id, u2.id],
    [fr1676.id, u1.id],
    [fr1674.id, u3.id],
  ] as const) {
    await prisma.orderEvent.createMany({
      data: [
        { orderId, fromStatus: null, toStatus: "DRAFT", actorId, at: at(9, 11, 0) },
        { orderId, fromStatus: "DRAFT", toStatus: "READY", actorId, at: at(8, 9, 30) },
        { orderId, fromStatus: "READY", toStatus: "IN_PROGRESS", actorId: u6.id, at: at(4, 8, 55) },
      ],
    });
  }

  const counts = {
    orders: await prisma.order.count(),
    subOrders: await prisma.order.count({ where: { parentId: { not: null } } }),
    operations: await prisma.operation.count(),
    supplies: await prisma.supply.count(),
    attachments: await prisma.attachment.count(),
  };
  console.log("seeded", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
