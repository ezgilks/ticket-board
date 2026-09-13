import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { BoardColumn } from "../components/BoardColumn";
import { Header } from "../components/Header";
import { TicketCard } from "../components/TicketCard";
import { type TicketPatch, TicketModal } from "../components/TicketModal";
import { api } from "../lib/api";
import { findTicket, moveTicketLocal, removeColumn, removeTicket, upsertColumn, upsertTicket } from "../lib/boardState";
import type { Board, Column, Ticket } from "../lib/types";

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [newColumn, setNewColumn] = useState("");

  // Snapshot taken when a drag starts, so a failed or cancelled drag can be undone.
  const dragStart = useRef<{ board: Board; columnId: string; index: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ board: Board }>("GET", `/boards/${boardId}`);
      setBoard(res.board);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  // PointerSensor needs 5px of movement before a drag starts, so plain clicks still open the modal.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!board) return <p className="p-8 text-slate-500">Loading…</p>;

  const isOwner = board.ownerId === user?.id;
  const openTicket = openTicketId ? findTicket(board, openTicketId)?.ticket : undefined;

  // Resolve what the pointer is over: a ticket (→ its column + index) or an empty column.
  function locate(b: Board, overId: string) {
    const hit = findTicket(b, overId);
    if (hit) return { columnId: hit.column.id, index: hit.index };
    const column = b.columns.find((c) => c.id === overId);
    return column ? { columnId: column.id, index: column.tickets.length } : null;
  }

  function onDragStart({ active }: DragStartEvent) {
    if (!board) return;
    const found = findTicket(board, String(active.id));
    if (!found) return;
    dragStart.current = { board, columnId: found.column.id, index: found.index };
    setActiveTicket(found.ticket);
  }

  // Fires continuously while dragging. When the pointer crosses into another column,
  // move the ticket there locally so that column opens a gap for it.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setBoard((b) => {
      if (!b) return b;
      const from = findTicket(b, String(active.id));
      const to = locate(b, String(over.id));
      if (!from || !to || from.column.id === to.columnId) return b;
      return moveTicketLocal(b, String(active.id), to.columnId, to.index);
    });
  }

  // Optimistic update: the UI already shows the new position. Tell the server;
  // if it refuses, roll back to the snapshot.
  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTicket(null);
    const start = dragStart.current;
    dragStart.current = null;
    if (!board || !start) return;

    const ticketId = String(active.id);
    let next = board;
    const current = findTicket(board, ticketId);
    const target = over ? locate(board, String(over.id)) : null;
    if (current && target && target.columnId === current.column.id) {
      next = moveTicketLocal(board, ticketId, target.columnId, target.index);
    }
    setBoard(next);

    const final = findTicket(next, ticketId);
    if (!final || (final.column.id === start.columnId && final.index === start.index)) return;

    try {
      const res = await api<{ ticket: Ticket; rebalanced: boolean }>("POST", `/tickets/${ticketId}/move`, {
        columnId: final.column.id,
        index: final.index,
      });
      if (res.rebalanced) await load();
      else setBoard((b) => (b ? upsertTicket(b, res.ticket) : b));
    } catch {
      setBoard(start.board);
      setError(null);
    }
  }

  function onDragCancel() {
    if (dragStart.current) setBoard(dragStart.current.board);
    dragStart.current = null;
    setActiveTicket(null);
  }

  async function createTicket(columnId: string, title: string) {
    const res = await api<{ ticket: Ticket }>("POST", `/boards/${boardId}/tickets`, { columnId, title });
    setBoard((b) => (b ? upsertTicket(b, res.ticket) : b));
  }

  async function saveTicket(ticketId: string, patch: TicketPatch) {
    const res = await api<{ ticket: Ticket }>("PATCH", `/tickets/${ticketId}`, patch);
    setBoard((b) => (b ? upsertTicket(b, res.ticket) : b));
  }

  async function deleteTicket(ticketId: string) {
    await api("DELETE", `/tickets/${ticketId}`);
    setBoard((b) => (b ? removeTicket(b, ticketId) : b));
    setOpenTicketId(null);
  }

  async function addColumn(e: FormEvent) {
    e.preventDefault();
    if (!newColumn.trim()) return;
    const res = await api<{ column: Column }>("POST", `/boards/${boardId}/columns`, { name: newColumn.trim() });
    setBoard((b) => (b ? upsertColumn(b, res.column) : b));
    setNewColumn("");
  }

  async function deleteColumn(column: Column) {
    if (!window.confirm(`Delete "${column.name}" and its ${column.tickets.length} tickets?`)) return;
    await api("DELETE", `/columns/${column.id}`);
    setBoard((b) => (b ? removeColumn(b, column.id) : b));
  }

  async function share() {
    const email = window.prompt("Invite a user by email");
    if (!email) return;
    try {
      await api("POST", `/boards/${boardId}/members`, { email });
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Invite failed");
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <Header>
        <div className="flex items-center gap-3">
          <h1 className="font-semibold">{board.name}</h1>
          <span className="text-sm text-slate-400">{board.members.map((m) => m.user.name).join(", ")}</span>
          {isOwner && (
            <button type="button" onClick={share} className="btn-ghost">
              Share
            </button>
          )}
        </div>
      </Header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <main className="flex flex-1 items-start gap-4 overflow-x-auto p-6">
          {board.columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              onOpenTicket={(t) => setOpenTicketId(t.id)}
              onCreateTicket={createTicket}
              onDeleteColumn={deleteColumn}
            />
          ))}

          <form onSubmit={addColumn} className="w-72 shrink-0">
            <input
              className="input mt-0"
              placeholder="+ Add column"
              aria-label="New column name"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
            />
          </form>
        </main>

        {/* The floating copy that follows the pointer while dragging. */}
        <DragOverlay>{activeTicket && <TicketCard ticket={activeTicket} overlay />}</DragOverlay>
      </DndContext>

      {openTicket && (
        <TicketModal
          key={openTicket.id}
          ticket={openTicket}
          members={board.members}
          onSave={(patch) => saveTicket(openTicket.id, patch)}
          onDelete={() => deleteTicket(openTicket.id)}
          onClose={() => setOpenTicketId(null)}
        />
      )}
    </div>
  );
}
