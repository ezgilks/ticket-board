import { type FormEvent, useState } from "react";
import type { Member, Priority, Ticket } from "../lib/types";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export interface TicketPatch {
  title: string;
  description: string | null;
  priority: Priority;
  labels: string[];
  assigneeId: string | null;
}

interface Props {
  ticket: Ticket;
  members: Member[];
  onSave: (patch: TicketPatch) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  children?: React.ReactNode;
}

export function TicketModal({ ticket, members, onSave, onDelete, onClose, children }: Props) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [labels, setLabels] = useState(ticket.labels.join(", "));
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? "");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await onSave({
        title,
        description: description.trim() ? description : null,
        priority,
        labels: labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        assigneeId: assigneeId || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit ticket"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-20"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Description</span>
          <textarea
            className="input min-h-24"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Priority</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Assignee</span>
            <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Labels (comma-separated)</span>
          <input className="input" value={labels} onChange={(e) => setLabels(e.target.value)} />
        </label>

        {children}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary">
            Save
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ml-auto text-sm text-red-600 hover:underline" onClick={onDelete}>
            Delete ticket
          </button>
        </div>
      </form>
    </div>
  );
}
