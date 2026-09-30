import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../lib/toast";
import { ConfirmDialog, InviteDialog } from "./Dialog";

describe("ConfirmDialog", () => {
  it("focuses Cancel, so a stray Enter can't delete anything", () => {
    render(<ConfirmDialog title="Delete?" message="Gone" confirmLabel="Delete" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("runs the action and closes on confirm", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ConfirmDialog title="Delete?" message="Gone" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open and shows the error when the action fails", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("Column not found"));
    render(<ConfirmDialog title="Delete?" message="Gone" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Column not found");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled(); // can retry
  });

  it("closes on Escape without running the action", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog title="Delete?" message="Gone" confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("InviteDialog", () => {
  it("keeps the typed email and shows the server's error inline", async () => {
    const onInvite = vi.fn().mockRejectedValue(new Error("No user with that email"));
    render(<InviteDialog onInvite={onInvite} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Email"), "bob@test.com");
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(onInvite).toHaveBeenCalledWith("bob@test.com");
    expect(await screen.findByRole("alert")).toHaveTextContent("No user with that email");
    expect(screen.getByLabelText("Email")).toHaveValue("bob@test.com");
  });

  it("closes once the invite succeeds", async () => {
    const onClose = vi.fn();
    render(<InviteDialog onInvite={vi.fn().mockResolvedValue(undefined)} onClose={onClose} />);

    await userEvent.type(screen.getByLabelText("Email"), "bob@test.com{Enter}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("toasts", () => {
  function Trigger() {
    const toast = useToast();
    return (
      <button type="button" onClick={() => toast.error("Couldn't move ticket")}>
        fail
      </button>
    );
  }

  it("shows an error as an alert and can be dismissed", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "fail" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't move ticket");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
