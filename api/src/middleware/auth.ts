import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/jwt.js";
import { unauthorized } from "../lib/errors.js";

// Teach TypeScript that authenticated requests carry a userId.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Reads "Authorization: Bearer <token>", verifies it, and attaches req.userId.
// Any route mounted after this middleware can trust req.userId.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  req.userId = verifyToken(header.slice("Bearer ".length));
  next();
}

// Helper for handlers that run behind requireAuth.
export function userIdOf(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
