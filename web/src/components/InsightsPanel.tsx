import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { BoardAnalytics } from "../lib/types";

function Bars({ rows }: { rows: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-2 rounded-full bg-slate-100">
            <span className="block h-2 rounded-full bg-indigo-500" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="text-right text-slate-500 tabular-nums">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

// Board analytics, computed server-side with hand-written SQL (api/src/services/analytics.ts).
export function InsightsPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [data, setData] = useState<BoardAnalytics | null>(null);

  useEffect(() => {
    api<{ analytics: BoardAnalytics }>("GET", `/boards/${boardId}/analytics`).then((res) => setData(res.analytics));
  }, [boardId]);

  const days = data?.createdPerDay ?? [];
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <aside
      aria-label="Board insights"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-sm space-y-6 overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Insights</h2>
        <button type="button" onClick={onClose} className="btn-ghost" aria-label="Close insights">
          ×
        </button>
      </div>

      {!data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">By column</h3>
            <Bars rows={data.byColumn.map((c) => ({ key: c.columnId, label: c.name, count: c.count }))} />
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">By priority</h3>
            <Bars rows={data.byPriority.map((p) => ({ key: p.priority, label: p.priority.toLowerCase(), count: p.count }))} />
          </section>
          {data.topLabels.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Top labels</h3>
              <Bars rows={data.topLabels.map((l) => ({ key: l.label, label: l.label, count: l.count }))} />
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Created, last 14 days
            </h3>
            <div className="flex h-20 items-end gap-1" role="img" aria-label="Tickets created per day">
              {days.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.count}`}
                  className="flex-1 rounded-t bg-indigo-500"
                  style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%`, opacity: d.count ? 1 : 0.15 }}
                />
              ))}
            </div>
          </section>
          <p className="text-sm text-slate-600">
            ✦ {data.aiTriaged.triaged} of {data.aiTriaged.total} tickets triaged by AI
          </p>
        </>
      )}
    </aside>
  );
}
