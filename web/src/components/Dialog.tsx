import { type ReactNode, useState } from "react";
import { describeError } from "../lib/api";

// In-app replacement for window.confirm (and the shell ShareDialog uses instead of window.prompt). The browser versions can't be
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
          {busy ? `${confirmLabel}…` : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
