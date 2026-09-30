import { aiEnabled } from "../ai/client.js";
import { prisma } from "../db.js";

/**
 * Seeds a new account with a board that already has content.
 *
 * Without this, a brand-new user lands on "No boards yet" and has to type their way
 * to every feature before seeing any of them work. The seed data is chosen so that
 * drag-and-drop, AI triage and semantic similarity all have something to show on the
 * first page load.
 */

interface SeedTicket {
  title: string;
  description: string;
  /** Left undefined on purpose for a few tickets, so AI triage has blanks to fill. */
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  labels?: string[];
}

// The first two are deliberate near-duplicates ("can't sign in on Safari" / "login
// fails on iOS Safari"). Similarity search has nothing to find on a board of
// unrelated one-liners, and a similarity demo that returns nothing reads as broken
// rather than empty.
const SEED: Record<string, SeedTicket[]> = {
  "To Do": [
    {
      title: "Users can't sign in on Safari",
      description:
        "Safari 17 users hit a redirect loop after submitting the login form. Chrome and Firefox are fine. Suspect the session cookie's SameSite attribute.",
    },
    {
      title: "Login fails on iOS Safari after a password reset",
      description:
        "Reported twice this week: resetting a password on iOS, then signing in, bounces the user back to the login screen. Possibly the same root cause as the Safari redirect loop.",
    },
    {
      title: "Checkout page takes 8 seconds to load",
      description:
        "The order summary issues one query per line item instead of a single batched read. Worst on carts with more than 20 items.",
    },
    {
      title: "Add CSV export to the reports page",
      description:
        "Finance asked for a plain CSV download of the monthly report so they can pivot it in a spreadsheet.",
      priority: "LOW",
      labels: ["feature", "data"],
    },
  ],
  "In Progress": [
    {
      title: "Rotate the leaked staging API key",
      description:
        "A staging key was committed to a public gist and needs rotating. Staging only, no customer data, but rotate today and add a pre-commit secret scan.",
      priority: "URGENT",
      labels: ["security", "infra"],
    },
    {
      title: "Dark mode toggle resets on reload",
      description: "The theme preference is kept in React state only, so a refresh drops it back to light.",
      priority: "LOW",
      labels: ["ux", "bug"],
    },
    {
      title: "Search returns nothing for hyphenated terms",
      description:
        'Searching "sign-in" returns zero results while "sign in" works. The tokenizer is splitting on the hyphen.',
    },
  ],
  Done: [
    {
      title: "Upgrade staging Postgres to 16",
      description: "Done ahead of the production upgrade. No migration changes were needed.",
      priority: "MEDIUM",
      labels: ["infra", "data"],
    },
    {
      title: "Fix the typo on the pricing page",
      description: '"Recieve" → "Receive" in the annual billing blurb.',
      priority: "LOW",
      labels: ["docs"],
    },
  ],
};

export const DEMO_BOARD_NAME = "Demo board";

/**
 * Creates the board, its columns and its tickets.
 *
 * Tickets can't ride along in the board's nested create: `Ticket` has two required
 * relations (board and column), and a nested create only fills in its immediate
 * parent's. So the board and columns go in first, then the tickets in one
 * `createMany` — both inside a transaction, so a new user never gets a half-built board.
 */
export async function seedDemoBoard(userId: string) {
  return prisma.$transaction(async (tx) => {
    const board = await tx.board.create({
      data: {
        name: DEMO_BOARD_NAME,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
        columns: {
          create: Object.keys(SEED).map((name, position) => ({ name, position })),
        },
      },
      include: { columns: true },
    });

    await tx.ticket.createMany({
      data: board.columns.flatMap((column) =>
        (SEED[column.name] ?? []).map((t, index) => ({
          boardId: board.id,
          columnId: column.id,
          title: t.title,
          description: t.description,
          ...(t.priority ? { priority: t.priority } : {}),
          labels: t.labels ?? [],
          // Matches createTicket: positions start at 1 and step by 1.
          position: index + 1,
          // Enrichment starts right after registration responds, so the very first
          // board a user opens explains why its cards are still filling in.
          aiStatus: aiEnabled() ? ("PENDING" as const) : null,
        })),
      ),
    });

    return board;
  });
}
