import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { type FormEvent, useState } from "react";
import type { Column, Ticket } from "../lib/types";
import { TicketCard } from "./TicketCard";

interface Props {
  column: Column;
  onOpenTicket: (ticket: Ticket) => void;
  onCreateTicket: (columnId: string, title: string) => Promise<void>;
  onDeleteColumn: (column: Column) => void;
}

export function BoardColumn({ column, onOpenTicket, onCreateTicket, onDeleteColumn }: Props) {
  // The column itself is a drop target, so tickets can land in an empty column.
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateTicket(column.id, title.trim());
    setTitle("");
    setAdding(false);
  }

  return (
    <section
      aria-label={column.name}
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-3 ${isOver ? "ring-2 ring-indigo-300" : ""}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {column.name} <span className="font-normal text-slate-400">{column.tickets.length}</span>
        </h2>
        <button
          type="button"
          aria-label={`Delete column ${column.name}`}
          onClick={() => onDeleteColumn(column)}
          className="text-slate-400 hover:text-red-600"
        >
          ×
        </button>
      </div>

      <SortableContext items={column.tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-16 flex-1 flex-col gap-2">
          {column.tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} onOpen={onOpenTicket} />
          ))}
        </div>
      </SortableContext>

      {adding ? (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: the user just clicked "Add ticket"
            autoFocus
            className="input mt-0"
            placeholder="Ticket title"
            aria-label="Ticket title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              Add
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-ghost mt-2 text-left">
          + Add ticket
        </button>
      )}
    </section>
  );
}
