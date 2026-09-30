import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { api, describeError } from "../lib/api";
import type { InviteInfo } from "../lib/types";

/**
 * Where an invite link lands. Public, because the person usually has no account yet:
 * show what they're joining, send them through sign-up (email filled in), and come back
 * here to accept.
 */
export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api<{ invite: InviteInfo }>("GET", `/invites/${token}`)
      .then((res) => setInvite(res.invite))
      .catch((err) => setError(describeError(err)));
  }, [token]);

  async function join() {
    setJoining(true);
    try {
      const { boardId } = await api<{ boardId: string }>("POST", `/invites/${token}/accept`);
      navigate(`/boards/${boardId}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
      setJoining(false);
    }
  }

  // LoginPage sends people back to `from` after signing in or registering.
  const toLogin = (mode: "login" | "register") =>
    navigate("/login", { state: { from: `/invite/${token}`, mode, email: invite?.email } });

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold">Ticket Board</h1>

        {error ? (
          <>
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
            <p className="text-sm text-slate-500">Ask whoever sent it for a new link.</p>
            <Link to="/" className="btn-ghost inline-block">
              Go to your boards
            </Link>
          </>
        ) : !invite || loading ? (
          <p className="text-sm text-slate-500">Loading invite…</p>
        ) : (
          <>
            <p>
              <strong>{invite.invitedBy}</strong> invited you to join <strong>{invite.boardName}</strong>.
            </p>

            {user ? (
              <>
                {user.email !== invite.email && (
                  <p className="text-xs text-slate-500">
                    This invite was sent to {invite.email}. You'll join as {user.email}.
                  </p>
                )}
                <button type="button" className="btn-primary w-full" onClick={join} disabled={joining}>
                  {joining ? "Joining…" : `Join as ${user.name}`}
                </button>
              </>
            ) : (
              <div className="space-y-2">
                <button type="button" className="btn-primary w-full" onClick={() => toLogin("register")}>
                  Create an account to join
                </button>
                <button type="button" className="btn-ghost w-full" onClick={() => toLogin("login")}>
                  I already have an account
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
