import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db.js";
import { conflict, notFound } from "../lib/errors.js";
import { assertOwner } from "./access.js";

// Inviting someone to a board by email.
//
//   Has an account  → added as a member straight away (as before).
//   No account yet  → a pending BoardInvite plus a one-time link the owner sends them
//                     themselves. Opening it leads to sign-up, then onto the board.
//
// The link's token is the credential, not the email. Registration doesn't verify email
// addresses, so "auto-join anyone who signs up as bob@x.com" would let anyone claim Bob's
// invite by typing his address. Requiring the token means only whoever received the link
// can accept it.

export const InviteInput = z.object({ email: z.email().transform((e) => e.toLowerCase()) });

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// SHA-256, not bcrypt. bcrypt is deliberately slow to protect *guessable* secrets like
// passwords. This token is 32 random bytes (256 bits): there's nothing to guess, so a fast
// hash is enough to make a stolen row useless.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const INVALID = "This invite link is invalid, has expired, or was already used";

export async function inviteByEmail(userId: string, boardId: string, input: z.infer<typeof InviteInput>) {
  await assertOwner(userId, boardId);

  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    const alreadyMember = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: existingUser.id } },
    });
    if (alreadyMember) throw conflict("Already a member");
    const member = await prisma.boardMember.create({
      data: { boardId, userId: existingUser.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return { kind: "member" as const, member };
  }

  // The raw token exists only in this response. Re-inviting the same email replaces the
  // row, which also kills the previous link.
  const token = randomBytes(32).toString("base64url");
  const fields = { tokenHash: hashToken(token), invitedById: userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
  const invite = await prisma.boardInvite.upsert({
    where: { boardId_email: { boardId, email: input.email } },
    create: { boardId, email: input.email, ...fields },
    update: { ...fields, createdAt: new Date() },
    select: { id: true, email: true, expiresAt: true },
  });
  return { kind: "invite" as const, invite, token };
}

/** Pending, unexpired invites for the Share dialog. Owner only. */
export async function listInvites(userId: string, boardId: string) {
  await assertOwner(userId, boardId);
  return prisma.boardInvite.findMany({
    where: { boardId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, expiresAt: true },
  });
}

export async function revokeInvite(userId: string, boardId: string, inviteId: string) {
  await assertOwner(userId, boardId);
  const { count } = await prisma.boardInvite.deleteMany({ where: { id: inviteId, boardId } });
  if (count === 0) throw notFound("Invite not found");
}

async function findValidInvite(token: string) {
  const invite = await prisma.boardInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { board: { select: { id: true, name: true } }, invitedBy: { select: { name: true } } },
  });
  if (!invite || invite.expiresAt <= new Date()) throw notFound(INVALID);
  return invite;
}

/** What the invite landing page shows before anyone signs in. Knowing the token is the permission. */
export async function describeInvite(token: string) {
  const invite = await findValidInvite(token);
  return {
    boardName: invite.board.name,
    invitedBy: invite.invitedBy.name,
    email: invite.email,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Join the board as whoever is signed in. Single use: the invite is deleted in the same
 * transaction, and the delete's row count is the check — two tabs accepting at once
 * can't both succeed, because only one DELETE finds the row.
 */
export async function acceptInvite(userId: string, token: string) {
  const invite = await findValidInvite(token);
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.boardInvite.deleteMany({ where: { id: invite.id } });
    if (count === 0) throw notFound(INVALID);
    // Upsert: accepting while already a member (e.g. added directly meanwhile) is fine.
    await tx.boardMember.upsert({
      where: { boardId_userId: { boardId: invite.boardId, userId } },
      create: { boardId: invite.boardId, userId },
      update: {},
    });
    return { boardId: invite.boardId };
  });
}
