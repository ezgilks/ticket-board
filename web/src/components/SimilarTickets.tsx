import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AiStatus, SimilarTicket } from "../lib/types";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; similar: SimilarTicket[] };

// Semantically similar tickets on the same board — possible duplicates or related work.
//
// Every outcome gets its own visible state. Returning null for "loading", "none found"
// and "request failed" alike made a cold AI service (tens of seconds to wake) look
// identical to a board with no duplicates.
export function SimilarTickets({
  ticketId,
  aiStatus,
  onOpen,
}: {
  ticketId: string;
  aiStatus: AiStatus | null;
  onOpen: (id: string) => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false; // ignore a late response if the modal switched tickets
    setState({ status: "loading" });
    api<{ similar: SimilarTicket[] }>("GET", `/tickets/${ticketId}/similar`)
      .then((res) => !cancelled && setState({ status: "ready", similar: res.similar }))
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  // aiStatus is null when enrichment never ran for this ticket — the service is switched
  // off, or the ticket predates the status column. There's nothing to promise, so stay
  // silent unless the search actually turns something up: showing a skeleton and then
  // removing the whole panel is worse than never showing it.
  if (aiStatus === null && !(state.status === "ready" && state.similar.length > 0)) return null;

  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Similar tickets</p>
      <Body state={state} aiStatus={aiStatus} onOpen={onOpen} />
    </div>
  );
}

function Body({
  state,
  aiStatus,
  onOpen,
}: {
  state: State;
  aiStatus: AiStatus | null;
  onOpen: (id: string) => void;
}) {
  if (state.status === "loading") {
    // role="status" both satisfies aria-label and announces the wait to screen readers.
    return (
      <div role="status" aria-label="Loading similar tickets" className="space-y-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return <p className="text-sm text-slate-500">Couldn't load similar tickets.</p>;
  }

  if (state.similar.length === 0) {
    // A pending ticket has no embedding yet, so the search genuinely can't match it —
    // that's a different thing from "searched, found nothing".
    return aiStatus === "PENDING" ? (
      <p className="text-sm text-slate-500">Indexing this ticket…</p>
    ) : (
      <p className="text-sm text-slate-500">No similar tickets on this board.</p>
    );
  }

  return (
    <ul className="space-y-1">
      {state.similar.map((s) => (
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
  );
}
