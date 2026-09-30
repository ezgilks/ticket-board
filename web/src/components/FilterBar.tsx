import { useEffect, useRef, useState } from "react";
import { type BoardFilter, EMPTY_FILTER, isFiltering, UNASSIGNED } from "../lib/boardFilter";
import type { Member, Priority } from "../lib/types";

const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

interface Props {
  filter: BoardFilter;
  onChange: (next: BoardFilter) => void;
  labels: string[];
  members: Member[];
  currentUserId?: string;
  shown: number;
  total: number;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        active ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-indigo-300"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterBar({ filter, onChange, labels, members, currentUserId, shown, total }: Props) {
  const search = useRef<HTMLInputElement>(null);
  const active = isFiltering(filter);
  // Phones: chips and the assignee picker fold behind a toggle, or they'd fill half the
  // screen before the first column. Search always stays visible.
  const [expanded, setExpanded] = useState(false);
  const chosen = filter.priorities.length + filter.labels.length + (filter.assignee ? 1 : 0);

  // "/" focuses search, the convention from GitHub, Linear and Slack.
  // Ignored while typing in a field, so "/" can still be typed into a ticket.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const typing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (typing) return;
      e.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Me" first, so the most common filter is one click.
  const people = [...members].sort((a, b) => Number(b.userId === currentUserId) - Number(a.userId === currentUserId));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2 sm:px-6">
      <input
        ref={search}
        type="search"
        aria-label="Search tickets"
        placeholder="Search tickets  ( / )"
        className="input mt-0 min-w-0 flex-1 py-1 sm:w-56 sm:flex-none"
        value={filter.text}
        onChange={(e) => onChange({ ...filter, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.currentTarget.blur();
          onChange({ ...filter, text: "" });
        }}
      />

      <button
        type="button"
        className="btn-ghost py-1 sm:hidden"
        aria-expanded={expanded}
        aria-controls="board-filters"
        onClick={() => setExpanded((v) => !v)}
      >
        Filters{chosen > 0 && ` (${chosen})`}
      </button>

      {/* `sm:contents` removes this wrapper from layout on wider screens, so its children
          sit in the bar exactly as if the wrapper weren't there. */}
      <div
        id="board-filters"
        className={`${expanded ? "flex" : "hidden"} w-full flex-wrap items-center gap-x-4 gap-y-2 sm:contents`}
      >
      <fieldset className="flex items-center gap-1.5">
        <legend className="sr-only">Priority</legend>
        {PRIORITIES.map((p) => (
          <Chip
            key={p}
            active={filter.priorities.includes(p)}
            onClick={() => onChange({ ...filter, priorities: toggle(filter.priorities, p) })}
          >
            {p.toLowerCase()}
          </Chip>
        ))}
      </fieldset>

      <select
        aria-label="Assignee"
        className="input mt-0 w-auto py-1"
        value={filter.assignee ?? ""}
        onChange={(e) => onChange({ ...filter, assignee: e.target.value || null })}
      >
        <option value="">Anyone</option>
        <option value={UNASSIGNED}>Unassigned</option>
        {people.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.userId === currentUserId ? `Me (${m.user.name})` : m.user.name}
          </option>
        ))}
      </select>

      {labels.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Labels</legend>
          {labels.map((l) => (
            <Chip key={l} active={filter.labels.includes(l)} onClick={() => onChange({ ...filter, labels: toggle(filter.labels, l) })}>
              #{l}
            </Chip>
          ))}
        </fieldset>
      )}
      </div>

      {active && (
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-500" aria-live="polite">
            {shown} of {total} tickets
          </span>
          <button type="button" className="btn-ghost py-1" onClick={() => onChange(EMPTY_FILTER)}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
