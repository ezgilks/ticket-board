import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { BoardListSkeleton, BoardSkeleton } from "../components/Loading";
import { useAuth } from "./AuthContext";

// Route guard: logged-out visitors are sent to /login, remembering where they were headed.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Checking the saved token is the first request after a cold start. Show the skeleton of
  // the page being opened, so it doesn't swap to a different skeleton once auth resolves.
  if (loading) {
    return location.pathname.startsWith("/boards/") ? (
      <BoardSkeleton />
    ) : (
      <main className="mx-auto max-w-4xl p-6">
        <BoardListSkeleton />
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
