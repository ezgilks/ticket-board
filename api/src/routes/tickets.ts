import { Router } from "express";
import { publishBoardEvent } from "../events.js";
import { originSocketId } from "../lib/origin.js";
import { idParam } from "../lib/params.js";
import { userIdOf } from "../middleware/auth.js";
import * as tickets from "../services/tickets.js";

export const ticketsRouter = Router();

ticketsRouter.patch("/:ticketId", async (req, res) => {
  const input = tickets.UpdateTicketInput.parse(req.body);
  const ticket = await tickets.updateTicket(userIdOf(req), idParam(req, "ticketId"), input);
  await publishBoardEvent(ticket.boardId, { type: "ticket:upserted", ticket }, originSocketId(req));
  res.json({ ticket });
});

ticketsRouter.post("/:ticketId/move", async (req, res) => {
  const input = tickets.MoveTicketInput.parse(req.body);
  const result = await tickets.moveTicket(userIdOf(req), idParam(req, "ticketId"), input);
  // A rebalance renumbered the whole column, so one ticket isn't enough — refetch.
  const event = result.rebalanced
    ? ({ type: "board:refresh" } as const)
    : ({ type: "ticket:upserted", ticket: result.ticket } as const);
  await publishBoardEvent(result.ticket.boardId, event, originSocketId(req));
  res.json(result);
});

ticketsRouter.delete("/:ticketId", async (req, res) => {
  const ticket = await tickets.deleteTicket(userIdOf(req), idParam(req, "ticketId"));
  await publishBoardEvent(ticket.boardId, { type: "ticket:deleted", ticketId: ticket.id }, originSocketId(req));
  res.status(204).end();
});
