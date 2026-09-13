import { Router } from "express";
import { publishBoardEvent } from "../events.js";
import { originSocketId } from "../lib/origin.js";
import { idParam } from "../lib/params.js";
import { userIdOf } from "../middleware/auth.js";
import * as columns from "../services/columns.js";

// ...but edited by their own id, since a column id is already globally unique.
export const columnsRouter = Router();

columnsRouter.patch("/:columnId", async (req, res) => {
  const input = columns.UpdateColumnInput.parse(req.body);
  const column = await columns.updateColumn(userIdOf(req), idParam(req, "columnId"), input);
  await publishBoardEvent(column.boardId, { type: "column:upserted", column }, originSocketId(req));
  res.json({ column });
});

columnsRouter.delete("/:columnId", async (req, res) => {
  const column = await columns.deleteColumn(userIdOf(req), idParam(req, "columnId"));
  await publishBoardEvent(column.boardId, { type: "column:deleted", columnId: column.id }, originSocketId(req));
  res.status(204).end();
});
