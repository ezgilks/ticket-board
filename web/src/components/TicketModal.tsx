import { type FormEvent, useState } from "react";
import { ApiError, describeError } from "../lib/api";
import type { Member, Priority, Ticket } from "../lib/types";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export interface TicketPatch {
  title: string;
  description: string | null;
  priority: Priority;
  labels: string[];
  assigneeId: string | null;
  /** The version this edit started from. The server rejects the save (409) if it's stale. */
  version: number;
}

interface Props {
  ticket: Ticket;
  members: Member[];
  onSave: (patch: TicketPatch) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function TicketModal({ ticket, members, onSave, onDelete, onClose, children }: Props) {
  // `ticket` is live: socket updates flow into it while the modal is open. `base` is the
  // snapshot the form was filled from. When the live version moves past it, someone else
  // (a teammate, or AI triage finishing) saved while this user was editing.
  const [base, setBase] = useState(ticket);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState<Priority>(ticket.priority);
  const [labels, setLabels] = useState(ticket.labels.join(", "));
  const [assigneeId, setAssigneeId] = useState(ticket.assigneeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const changedUnderneath = ticket.version > base.version;

  /** Throw away this user's edits and show what's saved now. */
  function loadLatest() {
    setBase(ticket);
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setPriority(ticket.priority);
    setLabels(ticket.labels.join(", "));
    setAssigneeId(ticket.assigneeId ?? "");
    setError(null);
  }

  async function save(version: number) {
    setError(null);
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
        version,
      });
      onClose();
    } catch (err) {
      // A 409 isn't an error to show: the board has already been given the current
      // ticket, which moves `ticket.version` past `base` and brings up the banner below.
      if (err instanceof ApiError && err.status === 409) return;
      setError(describeError(err));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save(base.version);
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

        {changedUnderneath && (
          <div role="alert" className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p>This ticket was changed while you were editing, by a teammate or by AI triage.</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost bg-white py-1" onClick={loadLatest}>
                Load their changes
              </button>
              {/* Saving against the version we've now seen is a deliberate overwrite. */}
              <button type="button" className="btn-ghost py-1 text-amber-800" onClick={() => save(ticket.version)}>
                Overwrite with mine
              </button>
            </div>
          </div>
        )}

        {ticket.aiStatus === "PENDING" && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            AI is triaging this ticket. The service sleeps when idle, so the first one can take up to a minute.
          </p>
        )}

        {ticket.aiStatus === "FAILED" && !ticket.aiTriage && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            AI triage didn't complete for this ticket. Its labels and priority are yours to set.
          </p>
        )}

        {ticket.aiTriage && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
            ✦ AI suggested <strong>{ticket.aiTriage.priority.toLowerCase()}</strong> priority
            {ticket.aiTriage.labels.length > 0 && <> and labels {ticket.aiTriage.labels.join(", ")}</>}
            <span className="text-violet-400"> · {ticket.aiTriage.provider}</span>
            {ticket.aiTriage.applied.length === 0 && <span className="text-violet-400"> · not applied (set by you)</span>}
          </p>
        )}

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
