import { Router } from "express";
import { userIdOf } from "../middleware/auth.js";
import { idParam } from "../lib/params.js";
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
  const input = boards.BoardInput.parse(req.body);
  res.json({ board: await boards.renameBoard(userIdOf(req), idParam(req, "boardId"), input) });
});

boardsRouter.delete("/:boardId", async (req, res) => {
  await boards.deleteBoard(userIdOf(req), idParam(req, "boardId"));
  res.status(204).end();
});

boardsRouter.post("/:boardId/members", async (req, res) => {
  const input = boards.AddMemberInput.parse(req.body);
  res.status(201).json({ member: await boards.addMember(userIdOf(req), idParam(req, "boardId"), input) });
});

// Columns and tickets are *created* under their board (so the URL says which board)...
boardsRouter.post("/:boardId/columns", async (req, res) => {
  const input = columns.CreateColumnInput.parse(req.body);
  res.status(201).json({ column: await columns.createColumn(userIdOf(req), idParam(req, "boardId"), input) });
});

boardsRouter.post("/:boardId/tickets", async (req, res) => {
  const input = tickets.CreateTicketInput.parse(req.body);
  res.status(201).json({ ticket: await tickets.createTicket(userIdOf(req), idParam(req, "boardId"), input) });
});
