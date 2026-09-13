import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { signToken } from "../lib/jwt.js";

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
const publicUser = { id: true, email: true, name: true, createdAt: true } as const;

export async function register(input: z.infer<typeof RegisterInput>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Email already registered");

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash },
    select: publicUser,
  });
  return { user, token: signToken(user.id) };
}

export async function login(input: z.infer<typeof LoginInput>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error for "no such user" and "wrong password", so attackers can't
  // use the login form to discover which emails are registered.
  const ok = user && (await bcrypt.compare(input.password, user.passwordHash));
  if (!user || !ok) throw unauthorized("Invalid email or password");

  const { passwordHash: _omit, ...safe } = user;
  return { user: safe, token: signToken(user.id) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  if (!user) throw unauthorized("User no longer exists");
  return user;
}
