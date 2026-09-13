import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext";
import { LoginPage } from "./LoginPage";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Home page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("LoginPage", () => {
  it("signs in, stores the token, and redirects home", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json(200, { token: "jwt-123", user: { id: "u1", email: "a@b.com", name: "Ada" } }));
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
    expect(localStorage.getItem("ticketboard.token")).toBe("jwt-123");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.com", password: "password123" });
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(401, { error: "Invalid email or password" }));
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(localStorage.getItem("ticketboard.token")).toBeNull();
  });

  it("switches to the register form", async () => {
    renderLogin();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });
});
