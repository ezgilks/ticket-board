import { Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { BoardPage } from "./pages/BoardPage";
import { BoardsPage } from "./pages/BoardsPage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Public: the person opening an invite usually has no account yet. */}
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <BoardsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/boards/:boardId"
        element={
          <RequireAuth>
            <BoardPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
