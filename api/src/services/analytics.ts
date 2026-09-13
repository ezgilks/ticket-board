import { prisma } from "../db.js";
import { assertMember } from "./access.js";

export interface BoardAnalytics {
  byColumn: { columnId: string; name: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  topLabels: { label: string; count: number }[];
  createdPerDay: { day: string; count: number }[];
  aiTriaged: { triaged: number; total: number };
}

/**
 * Board insights, in hand-written SQL. Each query shows a technique an ORM hides:
 * LEFT JOIN + GROUP BY (keep empty columns), unnest() over an array column,
 * generate_series() to fill in days with no tickets, and FILTER on an aggregate.
 * Every ${value} is a bind parameter, never pasted into the SQL string.
 */
export async function getBoardAnalytics(userId: string, boardId: string): Promise<BoardAnalytics> {
  await assertMember(userId, boardId);

  // The queries are independent, so run them concurrently.
  const [byColumn, byPriority, topLabels, createdPerDay, [aiTriaged]] = await Promise.all([
    // LEFT JOIN keeps columns with zero tickets; COUNT(t.id) counts only real matches.
    prisma.$queryRaw<BoardAnalytics["byColumn"]>`
      SELECT c.id AS "columnId", c.name, COUNT(t.id)::int AS count
      FROM "Column" c
      LEFT JOIN "Ticket" t ON t."columnId" = c.id
      WHERE c."boardId" = ${boardId}
      GROUP BY c.id, c.name, c.position
      ORDER BY c.position
    `,

    prisma.$queryRaw<BoardAnalytics["byPriority"]>`
      SELECT priority::text AS priority, COUNT(*)::int AS count
      FROM "Ticket"
      WHERE "boardId" = ${boardId}
      GROUP BY priority
      ORDER BY MIN(CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END)
    `,

    // unnest() turns each ticket's labels array into one row per label.
    prisma.$queryRaw<BoardAnalytics["topLabels"]>`
      SELECT label, COUNT(*)::int AS count
      FROM "Ticket", unnest(labels) AS label
      WHERE "boardId" = ${boardId}
      GROUP BY label
      ORDER BY count DESC, label
      LIMIT 5
    `,

    // generate_series() produces all 14 days, so days with no tickets show as 0, not missing.
    prisma.$queryRaw<BoardAnalytics["createdPerDay"]>`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COUNT(t.id)::int AS count
      FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, interval '1 day') AS d(day)
      LEFT JOIN "Ticket" t
        ON t."boardId" = ${boardId} AND t."createdAt"::date = d.day::date
      GROUP BY d.day
      ORDER BY d.day
    `,

    // FILTER (WHERE ...) = a conditional count, in one pass over the rows.
    prisma.$queryRaw<[BoardAnalytics["aiTriaged"]]>`
      SELECT COUNT(*) FILTER (WHERE "aiTriage" IS NOT NULL)::int AS triaged,
             COUNT(*)::int AS total
      FROM "Ticket"
      WHERE "boardId" = ${boardId}
    `,
  ]);

  return { byColumn, byPriority, topLabels, createdPerDay, aiTriaged: aiTriaged ?? { triaged: 0, total: 0 } };
}
