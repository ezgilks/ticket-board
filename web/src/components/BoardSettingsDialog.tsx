import { type FormEvent, useState } from "react";
import { describeError } from "../lib/api";
import type { Board, Member } from "../lib/types";
import { Dialog } from "./Dialog";

interface Props {
  board: Board;
  currentUserId: string | undefined;
  onRename: (name: string) => Promise<void>;
  /** These open a confirmation; the dialog itself never deletes anything directly. */
  onRemove: (member: Member) => void;
  onLeave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Owner: rename, remove members, delete the board.
 * Member: see who's on the board, and leave it.
 */
export function BoardSettingsDialog({ board, currentUserId, onRename, onRemove, onLeave, onDelete, onClose }: Props) {
  const isOwner = board.ownerId === currentUserId;
  const [name, setName] = useState(board.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renamed = name.trim() !== "" && name.trim() !== board.name;

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (!renamed) return;
    setSaving(true);
    setError(null);
    try {
      await onRename(name.trim());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog label="Board settings" onClose={onClose}>
      <h2 className="font-semibold">Board settings</h2>

      {isOwner && (
        <form onSubmit={rename} className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="text-sm font-medium">Name</span>
            <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary" disabled={!renamed || saving}>
            {saving ? "Saving…" : "Rename"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Members</h3>
        <ul className="space-y-1.5">
          {board.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
                {m.user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 truncate">
                {m.user.name}
                {m.userId === currentUserId && <span className="text-slate-400"> (you)</span>}
              </span>
              {m.role === "OWNER" ? (
                <span className="text-xs text-slate-400">owner</span>
              ) : (
                isOwner && (
                  <button
                    type="button"
                    aria-label={`Remove ${m.user.name}`}
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => onRemove(m)}
                  >
                    Remove
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        {isOwner ? (
          <button type="button" className="text-sm text-red-600 hover:underline" onClick={onDelete}>
            Delete board
          </button>
        ) : (
          <button type="button" className="text-sm text-red-600 hover:underline" onClick={onLeave}>
            Leave board
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
