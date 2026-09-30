import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import type { PendingInvite } from "../lib/types";
import { ShareDialog } from "./ShareDialog";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

function renderDialog(overrides: Partial<Parameters<typeof ShareDialog>[0]> = {}) {
  const props = {
    onInvite: vi.fn().mockResolvedValue({}),
    loadPending: vi.fn().mockResolvedValue([] as PendingInvite[]),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ShareDialog {...props} />);
  return props;
}

describe("ShareDialog", () => {
  it("closes once an existing user has been added", async () => {
    const { onInvite, onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText("Email"), "bob@test.com{Enter}");
    expect(onInvite).toHaveBeenCalledWith("bob@test.com");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a copyable link when the person has no account", async () => {
    const user = userEvent.setup(); // setup() installs a clipboard, which jsdom lacks
    const link = "http://localhost/invite/abc";
    const { onClose } = renderDialog({ onInvite: vi.fn().mockResolvedValue({ link }) });
    await user.type(screen.getByLabelText("Email"), "new@test.com{Enter}");

    expect(await screen.findByLabelText("Invite link")).toHaveValue(link);
    expect(screen.getByText(/new@test.com doesn't have an account yet/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(await navigator.clipboard.readText()).toBe(link);
    expect(screen.getByRole("button", { name: "Copied ✓" })).toBeInTheDocument();
  });

  it("keeps the typed email and shows the server's error inline", async () => {
    renderDialog({ onInvite: vi.fn().mockRejectedValue(new ApiError(409, "Already a member")) });
    await userEvent.type(screen.getByLabelText("Email"), "bob@test.com{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Already a member.");
    expect(screen.getByLabelText("Email")).toHaveValue("bob@test.com");
  });

  it("lists pending invites and revokes one", async () => {
    const pending = [{ id: "i1", email: "waiting@test.com", expiresAt: inDays(6.5) }];
    const { onRevoke } = renderDialog({ loadPending: vi.fn().mockResolvedValue(pending) });

    expect(await screen.findByText("waiting@test.com")).toBeInTheDocument();
    expect(screen.getByText("7d left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke invite for waiting@test.com" }));
    expect(onRevoke).toHaveBeenCalledWith("i1");
    expect(screen.queryByText("waiting@test.com")).not.toBeInTheDocument();
  });
});
