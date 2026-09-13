import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Ticket } from "../lib/types";
import { PriorityBadge } from "./PriorityBadge";

interface Props {
  ticket: Ticket;
  onOpen?: (ticket: Ticket) => void;
  overlay?: boolean;
}

export function TicketCard({ ticket, onOpen, overlay = false }: Props) {
  // useSortable wires this element into dnd-kit: listeners start a drag,
  // transform/transition animate it while siblings shuffle around.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
    data: { type: "ticket" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(ticket)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(ticket);
      }}
      className={`cursor-grab rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 hover:ring-indigo-300 ${
        isDragging && !overlay ? "opacity-40" : ""
      } ${overlay ? "rotate-2 shadow-lg" : ""}`}
    >
      <p className="text-sm font-medium">{ticket.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={ticket.priority} />
        {ticket.aiTriage && ticket.aiTriage.applied.length > 0 && (
          <span title={`Triaged by AI (${ticket.aiTriage.provider})`} className="text-xs text-violet-500">
            ✦ AI
          </span>
        )}
        {ticket.labels.map((l) => (
          <span key={l} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
            {l}
          </span>
        ))}
        {ticket.assignee && (
          <span
            title={ticket.assignee.name}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700"
          >
            {ticket.assignee.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
