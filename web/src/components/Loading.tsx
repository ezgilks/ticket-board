import { useSlowRequests } from "../lib/slowRequests";

// Loading UI. Skeletons mirror the real layout, so the page doesn't jump when data
// arrives and the wait reads as "content is coming" rather than "nothing is here".

/** Shown app-wide whenever a request has been pending a while: almost always a cold start. */
export function ColdStartBanner() {
  const slow = useSlowRequests();
  if (!slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-3 z-[70] mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
    >
      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      <span>
        Waking up the server<span className="hidden sm:inline">. The free hosting tier sleeps when idle</span>. This
        can take up to a minute.
      </span>
    </div>
  );
}

const Bar = ({ className }: { className: string }) => <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;

export function BoardListSkeleton() {
  return (
    <ul aria-label="Loading boards" className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="space-y-2 rounded-lg bg-white p-4 ring-1 ring-slate-200">
          <Bar className="h-4 w-1/2" />
          <Bar className="h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}

// Fixed placeholder shape: three columns with a few cards each, like the demo board.
const SKELETON_COLUMNS = [
  { id: "todo", cards: ["t1", "t2", "t3"] },
  { id: "doing", cards: ["d1", "d2"] },
  { id: "done", cards: ["x1"] },
];

/** Three columns of placeholder cards, laid out like the real board. */
export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading board" aria-busy="true" className="flex h-dvh flex-col">
      <div className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Bar className="h-5 w-28" />
        <Bar className="h-5 w-40" />
      </div>
      <div className="flex flex-1 items-start gap-4 overflow-hidden p-4 sm:p-6">
        {SKELETON_COLUMNS.map((col) => (
          <div key={col.id} className="w-72 shrink-0 space-y-2 rounded-xl bg-slate-100 p-3">
            <Bar className="mb-3 h-4 w-24" />
            {col.cards.map((card) => (
              <div key={card} className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <Bar className="h-3.5 w-5/6" />
                <Bar className="h-3 w-1/4" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
