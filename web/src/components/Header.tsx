import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

export function Header({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3">
      <Link to="/" className="font-semibold text-indigo-600">
        Ticket Board
      </Link>
      <div className="flex-1">{children}</div>
      <span className="text-sm text-slate-500">{user?.name}</span>
      <button type="button" onClick={logout} className="btn-ghost">
        Sign out
      </button>
    </header>
  );
}
