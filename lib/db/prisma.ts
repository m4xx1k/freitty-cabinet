import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 talks to Postgres through a driver adapter rather than its own engine binary.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// One client per process. Next.js dev reloads the module tree on every edit,
// so without the global cache each reload would open a new pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
