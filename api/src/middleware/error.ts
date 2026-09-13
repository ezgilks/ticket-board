import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";
import { Prisma } from "../generated/prisma/client.js";

// Express recognises error middleware by its 4 arguments. Express 5 forwards both
// thrown errors and rejected promises from async handlers here automatically.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", issues: err.issues });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: record not found. P2003: foreign key points at nothing.
    if (err.code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (err.code === "P2003") {
      res.status(400).json({ error: "Referenced record does not exist" });
      return;
    }
  }
  // Malformed JSON body.
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Malformed JSON" });
    return;
  }
  console.error(err);
  // Never leak stack traces or internal messages to clients.
  res.status(500).json({ error: "Internal server error" });
}
