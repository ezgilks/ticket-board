import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { describeError } from "../lib/api";

export function LoginPage() {
  const { user, login, register, tryAsGuest, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Arriving from an invite link: open on "register" with the invited email filled in.
  const state = location.state as {
    from?: string;
    mode?: "login" | "register";
    email?: string;
    signOut?: boolean;
  } | null;
  const [mode, setMode] = useState<"login" | "register">(state?.mode ?? "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // "Create a real account" from a guest session lands here with signOut: the sign-out
  // happens on this page, once. Signing out *before* navigating doesn't work: the protected
  // page re-renders first, its guard redirects to a plain /login, and the "register" mode is lost.
  const signOutPending = useRef(state?.signOut === true);
  useEffect(() => {
    if (signOutPending.current && user) {
      signOutPending.current = false;
      logout();
    }
  }, [user, logout]);

  const from = state?.from ?? "/";
  // Already signed in when arriving here → go on. Skipped while a sign-in started on this
  // page is finishing: that handler navigates itself (a guest goes to their demo board,
  // not `from`), and redirecting here too would race it.
  if (user && !submitting && !signOutPending.current) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function tryDemo() {
    setError(null);
    setSubmitting(true);
    try {
      const boardId = await tryAsGuest();
      navigate(`/boards/${boardId}`, { replace: true });
    } catch (err) {
      setError(describeError(err));
      setSubmitting(false);
    }
  }

  const isLogin = mode === "login";
  // Arriving from an invite means joining a specific board, which needs a real account.
  const fromInvite = state?.from?.startsWith("/invite/") ?? false;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div>
          <h1 className="text-2xl font-semibold">Ticket Board</h1>
          <p className="text-sm text-slate-500">{isLogin ? "Sign in to your boards" : "Create an account"}</p>
        </div>

        {!isLogin && (
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            className="input"
            type="password"
            minLength={isLogin ? undefined : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "…" : isLogin ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="w-full text-sm text-slate-500 hover:text-slate-800"
          onClick={() => {
            setMode(isLogin ? "register" : "login");
            setError(null);
          }}
        >
          {isLogin ? "No account? Register" : "Have an account? Sign in"}
        </button>

        {!fromInvite && (
          <div className="border-t border-slate-100 pt-4 text-center">
            <button type="button" onClick={tryDemo} disabled={submitting} className="btn-ghost w-full font-medium text-indigo-600">
              Just looking? Try the demo, no sign-up
            </button>
            <p className="mt-1 text-xs text-slate-400">A temporary account with a sample board, deleted after 24 hours.</p>
          </div>
        )}
      </form>
    </main>
  );
}
