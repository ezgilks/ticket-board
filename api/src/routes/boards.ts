import { Router } from "express";
import { enrichInBackground } from "../ai/enrich.js";
import { publishBoardEvent } from "../events.js";
import { evictFromBoard } from "../realtime.js";
import { originSocketId } from "../lib/origin.js";
import { idParam } from "../lib/params.js";
import { userIdOf } from "../middleware/auth.js";
import { getBoardAnalytics } from "../services/analytics.js";
import * as boards from "../services/boards.js";
import * as columns from "../services/columns.js";
import * as invites from "../services/invites.js";
import { SearchInput, searchTickets } from "../services/similar.js";
import * as tickets from "../services/tickets.js";

export const boardsRouter = Router();

boardsRouter.get("/", async (req, res) => {
  res.json({ boards: await boards.listBoards(userIdOf(req)) });
});

boardsRouter.post("/", async (req, res) => {
  const input = boards.BoardInput.parse(req.body);
  res.status(201).json({ board: await boards.createBoard(userIdOf(req), input) });
});

boardsRouter.get("/:boardId", async (req, res) => {
  res.json({ board: await boards.getBoard(userIdOf(req), idParam(req, "boardId")) });
});

boardsRouter.get("/:boardId/analytics", async (req, res) => {
  res.json({ analytics: await getBoardAnalytics(userIdOf(req), idParam(req, "boardId")) });
});

// Semantic search by free text. POST because the query is a body, not a cacheable resource.
boardsRouter.post("/:boardId/search", async (req, res) => {
  const input = SearchInput.parse(req.body);
  res.json({ results: await searchTickets(userIdOf(req), idParam(req, "boardId"), input) });
});

boardsRouter.patch("/:boardId", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const input = boards.BoardInput.parse(req.body);
  const board = await boards.renameBoard(userIdOf(req), boardId, input);
  await publishBoardEvent(boardId, { type: "board:refresh" }, originSocketId(req));
  res.json({ board });
});

boardsRouter.delete("/:boardId", async (req, res) => {
  const boardId = idParam(req, "boardId");
  await boards.deleteBoard(userIdOf(req), boardId);
  await publishBoardEvent(boardId, { type: "board:deleted" }, originSocketId(req));
  res.status(204).end();
});

// Existing account → added now. No account → a pending invite and a one-time link.
boardsRouter.post("/:boardId/members", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const input = invites.InviteInput.parse(req.body);
  const result = await invites.inviteByEmail(userIdOf(req), boardId, input);
  if (result.kind === "member") {
    await publishBoardEvent(boardId, { type: "board:refresh" }, originSocketId(req));
    res.status(201).json({ member: result.member });
    return;
  }
  // The only time the raw token leaves the server. The client builds the link from it.
  res.status(201).json({ invite: result.invite, token: result.token });
});

// The owner removing someone, or a member removing themselves (leaving).
boardsRouter.delete("/:boardId/members/:userId", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const targetId = idParam(req, "userId");
  await boards.removeMember(userIdOf(req), boardId, targetId);
  // Order matters: evict first, so the removed user's tabs don't receive the refresh below.
  await evictFromBoard(boardId, targetId);
  await publishBoardEvent(boardId, { type: "board:refresh" }, originSocketId(req));
  res.status(204).end();
});

boardsRouter.get("/:boardId/invites", async (req, res) => {
  res.json({ invites: await invites.listInvites(userIdOf(req), idParam(req, "boardId")) });
});

boardsRouter.delete("/:boardId/invites/:inviteId", async (req, res) => {
  await invites.revokeInvite(userIdOf(req), idParam(req, "boardId"), idParam(req, "inviteId"));
  res.status(204).end();
});

// Columns and tickets are *created* under their board (so the URL says which board)...
boardsRouter.post("/:boardId/columns", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const input = columns.CreateColumnInput.parse(req.body);
  const column = await columns.createColumn(userIdOf(req), boardId, input);
  await publishBoardEvent(boardId, { type: "column:upserted", column }, originSocketId(req));
  res.status(201).json({ column });
});

boardsRouter.post("/:boardId/tickets", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const input = tickets.CreateTicketInput.parse(req.body);
  const ticket = await tickets.createTicket(userIdOf(req), boardId, input);
  await publishBoardEvent(boardId, { type: "ticket:upserted", ticket }, originSocketId(req));
  res.status(201).json({ ticket });
  // After responding — see ai/enrich.ts. AI only fills in what the user didn't set.
  enrichInBackground(ticket.id, {
    triage: true,
    applyPriority: input.priority === undefined,
    applyLabels: !input.labels?.length,
  });
});
