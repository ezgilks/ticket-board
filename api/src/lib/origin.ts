import type { Request } from "express";

// The web client sends its socket id with each REST call so the server can
// skip echoing the resulting event back to the tab that caused it.
export function originSocketId(req: Request): string | undefined {
  const id = req.headers["x-socket-id"];
  return typeof id === "string" && id.length < 64 ? id : undefined;
}
