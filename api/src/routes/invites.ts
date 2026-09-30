import { type Request, Router } from "express";
import { z } from "zod";
import { publishBoardEvent } from "../events.js";
import { notFound } from "../lib/errors.js";
import { requireAuth, userIdOf } from "../middleware/auth.js";
import * as invites from "../services/invites.js";

export const invitesRouter = Router();

// 32 random bytes in base64url is always 43 characters. Anything else can't be a token,
// so answer 404 without hashing it or touching the database.
function tokenParam(req: Request) {
  const parsed = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .safeParse(req.params["token"]);
  if (!parsed.success) throw notFound("This invite link is invalid, has expired, or was already used");
  return parsed.data;
}

// Public: the landing page shows "Alice invited you to Demo board" before sign-up.
invitesRouter.get("/:token", async (req, res) => {
  res.json({ invite: await invites.describeInvite(tokenParam(req)) });
});

invitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const { boardId } = await invites.acceptInvite(userIdOf(req), tokenParam(req));
  // Everyone on the board sees the new member appear.
  await publishBoardEvent(boardId, { type: "board:refresh" });
  res.json({ boardId });
});
