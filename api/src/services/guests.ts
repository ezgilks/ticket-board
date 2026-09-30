import { randomBytes, randomInt } from "node:crypto";
import { enrichSeededBoardInBackground } from "../ai/enrich.js";
import { prisma } from "../db.js";
import { signToken } from "../lib/jwt.js";
import { seedDemoBoard } from "./demoBoard.js";

// "Try it without signing up." Someone opening the demo link shouldn't have to invent an
// email and password before seeing anything, so one click creates a temporary account with
// the seeded demo board and signs them straight in.
//
// Guests expire. Their token lasts as long as the account, and deleteExpiredGuests() removes
// the account and every board it owns once it's older than GUEST_TTL_MS.

export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

// Not a bcrypt hash, so no password can ever match it; login() also refuses guests outright.
const NO_PASSWORD = "!guest-account:no-password";

export async function createGuest() {
  // `.invalid` is reserved (RFC 2606): it can never be someone's real inbox.
  const email = `guest-${randomBytes(8).toString("hex")}@guest.invalid`;
  const user = await prisma.user.create({
    data: { email, name: `Guest ${randomInt(1000, 10000)}`, passwordHash: NO_PASSWORD, isGuest: true },
    select: { id: true, email: true, name: true, createdAt: true, isGuest: true },
  });

  // Unlike registration, the board isn't optional: an empty account is no demo at all.
  const board = await seedDemoBoard(user.id);
  enrichSeededBoardInBackground(board.id);

  // Opportunistic cleanup: whoever creates a guest also clears out the expired ones.
  // Fire-and-forget, so a slow cleanup never delays someone's first look at the app.
  deleteExpiredGuests().catch((err) => console.error("[guests] cleanup failed:", err));

  return { user, token: signToken(user.id, "24h"), boardId: board.id };
}

/**
 * Delete guests older than the TTL, and the boards they own.
 *
 * Boards go first on purpose: Board.ownerId is ON DELETE RESTRICT (deleting a real user
 * must never silently destroy their boards), so Postgres refuses to delete a user who still
 * owns one. Memberships, invites and their tickets' assignments go with the user by cascade.
 */
export async function deleteExpiredGuests(now = new Date()) {
  const cutoff = new Date(now.getTime() - GUEST_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const expired = await tx.user.findMany({
      where: { isGuest: true, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    const ids = expired.map((u) => u.id);
    if (ids.length === 0) return 0;
    await tx.board.deleteMany({ where: { ownerId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  });
}

/** Hourly sweep while the API is up, on top of the opportunistic one above. */
export function scheduleGuestCleanup() {
  const timer = setInterval(
    () => {
      deleteExpiredGuests()
        .then((n) => n > 0 && console.log(`[guests] deleted ${n} expired guest account(s)`))
        .catch((err) => console.error("[guests] cleanup failed:", err));
    },
    60 * 60 * 1000,
  );
  timer.unref(); // never keep the process alive just for this
  return timer;
}
