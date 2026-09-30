import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { board as boardFixture } from "../test/fixtures";
import type { Board, Member } from "../lib/types";
import { BoardSettingsDialog } from "./BoardSettingsDialog";

const member = (userId: string, name: string, role: Member["role"]): Member => ({
  userId,
  role,
  user: { id: userId, name, email: `${userId}@test.com` },
});

const board: Board = {
  ...boardFixture(),
  name: "Launch plan",
  ownerId: "u1",
  members: [member("u1", "Alice", "OWNER"), member("u2", "Bob", "MEMBER")],
};

function renderAs(currentUserId: string) {
  const props = {
    onRename: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn(),
    onLeave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
  render(<BoardSettingsDialog board={board} currentUserId={currentUserId} {...props} />);
  return props;
}

describe("BoardSettingsDialog", () => {
  it("lets the owner rename, but only once the name actually changed", async () => {
    const { onRename } = renderAs("u1");
    const rename = screen.getByRole("button", { name: "Rename" });
    expect(rename).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Launch v2");
    await userEvent.click(rename);
    expect(onRename).toHaveBeenCalledWith("Launch v2");
  });

  it("gives the owner Remove for members (not themselves) and Delete board", async () => {
    const { onRemove, onDelete } = renderAs("u1");
    expect(screen.queryByRole("button", { name: "Remove Alice" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Bob" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2" }));

    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(onDelete).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Leave board" })).not.toBeInTheDocument();
  });

  it("gives a member the list and Leave, and nothing that needs ownership", async () => {
    const { onLeave } = renderAs("u2");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete board" })).not.toBeInTheDocument();
    expect(screen.getByText("(you)")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Leave board" }));
    expect(onLeave).toHaveBeenCalled();
  });
});
