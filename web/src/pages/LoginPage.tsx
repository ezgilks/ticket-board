import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === "login";

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
      </form>
    </main>
  );
}
