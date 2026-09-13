import type { Request } from "express";
import { z } from "zod";
import { notFound } from "./errors.js";

// Route params are untrusted strings. A malformed id can't match any row, so
// answer 404 up front instead of sending garbage to Postgres.
export function idParam(req: Request, name: string): string {
  const parsed = z.uuid().safeParse(req.params[name]);
  if (!parsed.success) throw notFound();
  return parsed.data;
}
