import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { InvitePage } from "./InvitePage";
import { LoginPage } from "./LoginPage";

const TOKEN = "t".repeat(43);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const invite = { boardName: "Launch plan", invitedBy: "Alice", email: "bob@test.com", expiresAt: "2026-10-07T00:00:00Z" };

/** A tiny fake API, routed by method + path, recording what the page sent. */
function fakeApi(overrides: Record<string, () => Response> = {}) {
  const routes: Record<string, () => Response> = {
    [`GET /api/invites/${TOKEN}`]: () => json(200, { invite }),
    "POST /api/auth/register": () => json(201, { token: "jwt", user: { id: "u2", email: "bob@test.com", name: "Bob" } }),
    [`POST /api/invites/${TOKEN}/accept`]: () => json(200, { boardId: "board-1" }),
    ...overrides,
  };
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`unexpected request: ${key}`);
    return route();
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/boards/:boardId" element={<p>Board page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("InvitePage", () => {
  it("takes a new user through sign-up and onto the board", async () => {
    const fetchMock = fakeApi();
    renderAt(`/invite/${TOKEN}`);

    expect(await screen.findByText(/invited you to join/)).toHaveTextContent("Alice invited you to join Launch plan.");
    await userEvent.click(screen.getByRole("button", { name: "Create an account to join" }));

    // Register form, invited email already filled in.
    expect(screen.getByLabelText("Email")).toHaveValue("bob@test.com");
    await userEvent.type(screen.getByLabelText("Name"), "Bob");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    // Back on the invite, now signed in.
    await userEvent.click(await screen.findByRole("button", { name: "Join as Bob" }));
    expect(await screen.findByText("Board page")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/invites/${TOKEN}/accept`, expect.objectContaining({ method: "POST" }));
  });

  it("explains a dead link instead of showing a blank page", async () => {
    fakeApi({
      [`GET /api/invites/${TOKEN}`]: () => json(404, { error: "This invite link is invalid, has expired, or was already used" }),
    });
    renderAt(`/invite/${TOKEN}`);
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid, has expired, or was already used.");
    expect(screen.getByText("Ask whoever sent it for a new link.")).toBeInTheDocument();
  });
});
