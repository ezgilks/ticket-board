import { Router } from "express";
import { userIdOf } from "../middleware/auth.js";
import { idParam } from "../lib/params.js";
import * as columns from "../services/columns.js";

// ...but edited by their own id, since a column id is already globally unique.
export const columnsRouter = Router();

columnsRouter.patch("/:columnId", async (req, res) => {
  const input = columns.UpdateColumnInput.parse(req.body);
  res.json({ column: await columns.updateColumn(userIdOf(req), idParam(req, "columnId"), input) });
});

columnsRouter.delete("/:columnId", async (req, res) => {
  await columns.deleteColumn(userIdOf(req), idParam(req, "columnId"));
  res.status(204).end();
});
