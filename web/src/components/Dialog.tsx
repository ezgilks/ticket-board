import { type FormEvent, type ReactNode, useState } from "react";
import { describeError } from "../lib/api";

// In-app replacements for window.confirm / window.prompt. The browser versions can't be
// styled, block the whole tab, and some browsers let users suppress them entirely — at
// which point confirm() silently returns false and the button just stops working.

interface DialogProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** Backdrop + panel. Escape or a click outside closes it, same as TicketModal. */
export function Dialog({ label, onClose, children }: DialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-32"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">{children}</div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** A destructive yes/no. Stays open and shows the error if the action fails. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog label={title} onClose={onClose}>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-slate-600">{message}</p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {/* biome-ignore lint/a11y/noAutofocus: focus the safe choice, so Enter doesn't delete */}
        <button type="button" className="btn-ghost" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

interface InviteProps {
  onInvite: (email: string) => Promise<void>;
  onClose: () => void;
}

/** Invite by email. A server error ("No user with that email") shows inline, keeping what was typed. */
export function InviteDialog({ onInvite, onClose }: InviteProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onInvite(email.trim());
      onClose();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <Dialog label="Share board" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="font-semibold">Share board</h2>
          <p className="text-sm text-slate-500">They need an account already. Members can view and edit.</p>
        </div>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            autoFocus
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Inviting…" : "Invite"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
