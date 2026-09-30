import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";

// On a phone there's no room for brand, page controls and account on one line, so the
// page's controls (children) drop to a full-width second row. From `sm` up it's one row.
export function Header({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
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
    {user?.isGuest && (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
        <span>You're exploring as a guest. This account and its boards are deleted after 24 hours.</span>
        <button
          type="button"
          className="font-medium underline"
          // LoginPage signs the guest out once it's showing; see signOutPending there.
          onClick={() => navigate("/login", { state: { mode: "register", signOut: true } })}
        >
          Create a real account
        </button>
      </div>
    )}
    </>
  );
}
