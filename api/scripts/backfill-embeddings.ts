// Embeds every ticket that has no vector yet (e.g. created while ai-service was down).
// Usage: npm run ai:backfill
import { enrichTicket } from "../src/ai/enrich.js";
import { aiEnabled } from "../src/ai/client.js";
import { prisma } from "../src/db.js";

if (!aiEnabled()) {
  console.error("AI_SERVICE_URL is not set");
  process.exit(1);
}

const missing = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Ticket" WHERE embedding IS NULL`;
console.log(`Embedding ${missing.length} tickets…`);
for (const { id } of missing) await enrichTicket(id);
console.log("Done");
await prisma.$disconnect();
