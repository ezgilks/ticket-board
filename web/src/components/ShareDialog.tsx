import { type FormEvent, useEffect, useState } from "react";
import { describeError } from "../lib/api";
import type { PendingInvite } from "../lib/types";
import { Dialog } from "./Dialog";

interface Props {
  /** Resolves with a link when the email has no account yet (they were invited, not added). */
  onInvite: (email: string) => Promise<{ link?: string }>;
  loadPending: () => Promise<PendingInvite[]>;
  onRevoke: (inviteId: string) => Promise<void>;
  onClose: () => void;
}

const daysLeft = (iso: string) => Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/**
 * Invite by email. An existing account is added immediately and the dialog closes.
 * An unknown email gets a one-time link to send them, since the app doesn't send email.
 */
export function ShareDialog({ onInvite, loadPending, onRevoke, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingInvite[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the dialog opens
  useEffect(() => {
    loadPending()
      .then(setPending)
      .catch(() => {}); // the list is a convenience; inviting still works without it
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { link } = await onInvite(email.trim());
      if (!link) {
        onClose(); // they had an account and are on the board now
        return;
      }
      setCreated({ email: email.trim(), link });
      setPending(await loadPending().catch(() => pending));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically. Select the link and copy it.");
    }
  }

  async function revoke(id: string) {
    try {
      await onRevoke(id);
      setPending((p) => p.filter((i) => i.id !== id));
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <Dialog label="Share board" onClose={onClose}>
      {created ? (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold">Invite link created</h2>
            <p className="text-sm text-slate-500">
              {created.email} doesn't have an account yet. Send them this link. It works once and expires in 7 days.
            </p>
          </div>
          <input
            readOnly
            aria-label="Invite link"
            className="input font-mono text-xs"
            value={created.link}
            onFocus={(e) => e.currentTarget.select()}
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setCreated(null);
                setCopied(false);
                setEmail("");
              }}
            >
              Invite someone else
            </button>
            {/* biome-ignore lint/a11y/noAutofocus: copying is the one thing to do here */}
            <button type="button" className="btn-primary" onClick={() => copy(created.link)} autoFocus>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h2 className="font-semibold">Share board</h2>
            <p className="text-sm text-slate-500">
              People with an account are added right away. Anyone else gets an invite link.
            </p>
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
      )}

      {pending.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Pending invites</h3>
          <ul className="space-y-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{i.email}</span>
                <span className="text-xs text-slate-400">{daysLeft(i.expiresAt)}d left</span>
                <button
                  type="button"
                  aria-label={`Revoke invite for ${i.email}`}
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => revoke(i.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
