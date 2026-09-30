import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";

// On a phone there's no room for brand, page controls and account on one line, so the
// page's controls (children) drop to a full-width second row. From `sm` up it's one row.
export function Header({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-nowrap sm:px-6">
      <Link to="/" className="shrink-0 font-semibold text-indigo-600">
        Ticket Board
      </Link>
      {children ? (
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">{children}</div>
      ) : (
        <div className="flex-1" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-4 sm:ml-0">
        <span className="hidden text-sm text-slate-500 sm:inline">{user?.name}</span>
        <button type="button" onClick={logout} className="btn-ghost">
          Sign out
        </button>
      </div>
    </header>
  );
}
