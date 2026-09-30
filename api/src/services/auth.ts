import bcrypt from "bcryptjs";
import { z } from "zod";
import { enrichSeededBoardInBackground } from "../ai/enrich.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { signToken } from "../lib/jwt.js";
import { seedDemoBoard } from "./demoBoard.js";

export const RegisterInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(72), // bcrypt ignores bytes past 72
  name: z.string().trim().min(1).max(80),
});

export const LoginInput = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

// bcrypt cost factor: each +1 doubles hashing time. 12 is ~250ms — slow enough to
// make brute-forcing a leaked hash expensive, fast enough that login feels instant.
const BCRYPT_ROUNDS = 12;

// Pick only safe fields. passwordHash must never leave the server.
const publicUser = { id: true, email: true, name: true, createdAt: true, isGuest: true } as const;

export async function register(input: z.infer<typeof RegisterInput>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
    select: publicUser,
  });

  // Seeded inline, not in the background: the client navigates straight to the board
  // list after registering, so the board has to exist by the time this responds.
  // A seed failure must never cost someone their account, hence the catch.
  if (config.SEED_DEMO_BOARD === "on") {
    try {
      const board = await seedDemoBoard(user.id);
      enrichSeededBoardInBackground(board.id); // embeddings + triage, after the response
    } catch (err) {
      console.error("[seed] demo board failed for", user.id, err instanceof Error ? err.message : err);
    }
  }

  return { user, token: signToken(user.id) };
}

export async function login(input: z.infer<typeof LoginInput>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for "no such user" and "wrong password", so attackers can't
  // use the login form to discover which emails are registered.
  // Guests have no password, so they can never sign in with one (same generic error).
  const ok = user && !user.isGuest && (await bcrypt.compare(input.password, user.passwordHash));
  if (!user || !ok) throw unauthorized("Invalid email or password");

  const { passwordHash: _omit, ...safe } = user;
  return { user: safe, token: signToken(user.id) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  if (!user) throw unauthorized("User no longer exists");
  return user;
}
