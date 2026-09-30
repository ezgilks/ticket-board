import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { ticket } from "../test/fixtures";
import { TicketModal } from "./TicketModal";

const original = ticket({ id: "t1", columnId: "todo", title: "Original", version: 1 });
const theirs = { ...original, title: "Their title", version: 2 };

function renderModal(onSave = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) {
  const view = render(
    <TicketModal ticket={original} members={[]} onSave={onSave} onDelete={vi.fn()} onClose={onClose} />,
  );
  // The board re-renders the open modal with the live ticket, the way a socket update does.
  const liveUpdate = (t: typeof original) =>
    view.rerender(<TicketModal ticket={t} members={[]} onSave={onSave} onDelete={vi.fn()} onClose={onClose} />);
  return { onSave, onClose, liveUpdate };
}

describe("TicketModal conflicts", () => {
  it("saves with the version the edit started from", async () => {
    const { onSave, onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
    expect(onClose).toHaveBeenCalled();
  });

  it("warns when someone else saves while it's open, without touching the user's edits", async () => {
    const { liveUpdate } = renderModal();
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "My title");

    liveUpdate(theirs);
    expect(screen.getByRole("alert")).toHaveTextContent("changed while you were editing");
    expect(screen.getByLabelText("Title")).toHaveValue("My title");
  });

  it("'Load their changes' replaces the form with the saved ticket", async () => {
    const { liveUpdate } = renderModal();
    liveUpdate(theirs);
    await userEvent.click(screen.getByRole("button", { name: "Load their changes" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Their title");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("'Overwrite with mine' saves against the version it was just shown", async () => {
    const { onSave, liveUpdate } = renderModal();
    liveUpdate(theirs);
    await userEvent.click(screen.getByRole("button", { name: "Overwrite with mine" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Original", version: 2 }));
  });

  it("stays open on a 409 instead of showing it as an error", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError(409, "changed"));
    const { onClose } = renderModal(onSave);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("changed.")).not.toBeInTheDocument();
  });
});
