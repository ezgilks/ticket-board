import { Router } from "express";
import { enrichInBackground } from "../ai/enrich.js";
import { publishBoardEvent } from "../events.js";
import { originSocketId } from "../lib/origin.js";
import { idParam } from "../lib/params.js";
import { userIdOf } from "../middleware/auth.js";
import * as boards from "../services/boards.js";
import * as columns from "../services/columns.js";
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

boardsRouter.post("/:boardId/members", async (req, res) => {
  const boardId = idParam(req, "boardId");
  const input = boards.AddMemberInput.parse(req.body);
  const member = await boards.addMember(userIdOf(req), boardId, input);
  await publishBoardEvent(boardId, { type: "board:refresh" }, originSocketId(req));
  res.status(201).json({ member });
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
