import type { User } from "../lib/types";

const COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
];

// Stable per person: the same user keeps the same colour across reloads and across
// everyone else's screens, because it's derived from their id rather than list order.
function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % COLORS.length;
  return COLORS[h] ?? COLORS[0];
}

const MAX_SHOWN = 4;

/** Overlapping avatars for everyone currently viewing the board. */
export function PresenceAvatars({ users, currentUserId }: { users: User[]; currentUserId?: string }) {
  if (users.length === 0) return null;

  // Put the current user first so the row doesn't reshuffle as other people come and go.
  const ordered = [...users].sort((a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId));
  const shown = ordered.slice(0, MAX_SHOWN);
  const overflow = ordered.length - shown.length;

  return (
    <div className="flex items-center gap-1.5" title={`${users.length} viewing: ${ordered.map((u) => u.name).join(", ")}`}>
      <div className="flex -space-x-1.5">
        {shown.map((u) => (
          <span
            key={u.id}
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ring-2 ring-white ${colorFor(u.id)}`}
          >
            {u.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
        {overflow > 0 && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600 ring-2 ring-white">
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-xs text-slate-400">
        {users.length === 1 ? "only you" : `${users.length} viewing`}
      </span>
    </div>
  );
}
