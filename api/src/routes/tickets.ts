import { Router } from "express";
import { userIdOf } from "../middleware/auth.js";
import { idParam } from "../lib/params.js";
import * as tickets from "../services/tickets.js";

export const ticketsRouter = Router();

ticketsRouter.patch("/:ticketId", async (req, res) => {
  const input = tickets.UpdateTicketInput.parse(req.body);
  res.json({ ticket: await tickets.updateTicket(userIdOf(req), idParam(req, "ticketId"), input) });
});

ticketsRouter.post("/:ticketId/move", async (req, res) => {
  const input = tickets.MoveTicketInput.parse(req.body);
  res.json(await tickets.moveTicket(userIdOf(req), idParam(req, "ticketId"), input));
});

ticketsRouter.delete("/:ticketId", async (req, res) => {
  await tickets.deleteTicket(userIdOf(req), idParam(req, "ticketId"));
  res.status(204).end();
});
