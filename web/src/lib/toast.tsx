import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

// Toasts: short, non-blocking messages ("Invite sent", "Couldn't move ticket") that
// replace window.alert. alert() freezes the whole tab until it's dismissed; a toast
// reports the problem and gets out of the way.
//
// Context is how any component deep in the tree can call toast.error() without
// the function being threaded through props.

type Kind = "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { id, kind, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  // Memoised so consumers don't re-render every time a toast appears or disappears.
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live: screen readers announce new toasts without moving focus. */}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${
              t.kind === "error" ? "bg-red-600 text-white" : "bg-slate-900 text-white"
            }`}
          >
            <span className="flex-1">{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Turns anything thrown into something fit to show a user. */
export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message) || fallback;
