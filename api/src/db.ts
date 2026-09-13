import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { config } from "./config.js";

// Prisma 7 talks to Postgres through a "driver adapter" (here, node-postgres).
// One client per process: it owns a connection pool, so creating one per request
// would exhaust the database's connection limit.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
});
