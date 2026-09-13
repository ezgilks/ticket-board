import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { SimilarTicket } from "../lib/types";

// Semantically similar tickets on the same board — possible duplicates or related work.
export function SimilarTickets({ ticketId, onOpen }: { ticketId: string; onOpen: (id: string) => void }) {
  const [similar, setSimilar] = useState<SimilarTicket[] | null>(null);

  useEffect(() => {
    let cancelled = false; // ignore a late response if the modal switched tickets
    api<{ similar: SimilarTicket[] }>("GET", `/tickets/${ticketId}/similar`)
      .then((res) => !cancelled && setSimilar(res.similar))
      .catch(() => !cancelled && setSimilar([]));
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  if (!similar || similar.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Similar tickets</p>
      <ul className="space-y-1">
        {similar.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-white"
            >
              <span className="flex-1 truncate">{s.title}</span>
              <span className="text-xs text-slate-400">{s.columnName}</span>
              <span className="w-10 text-right text-xs text-slate-500 tabular-nums">
                {Math.round(s.similarity * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
