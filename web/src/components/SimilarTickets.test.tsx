import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SimilarTickets } from "./SimilarTickets";

const respond = (body: unknown) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }));

describe("SimilarTickets", () => {
  it("lists similar tickets with a percentage and opens one on click", async () => {
    respond({ similar: [{ id: "s1", title: "Can't sign in", columnName: "Done", similarity: 0.812 }] });
    const onOpen = vi.fn();
    render(<SimilarTickets ticketId="t1" aiStatus="DONE" onOpen={onOpen} />);

    expect(await screen.findByText("Can't sign in")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Can't sign in"));
    expect(onOpen).toHaveBeenCalledWith("s1");
  });

  it("says so when the board has no matches", async () => {
    respond({ similar: [] });
    render(<SimilarTickets ticketId="t1" aiStatus="DONE" onOpen={vi.fn()} />);
    expect(await screen.findByText("No similar tickets on this board.")).toBeInTheDocument();
  });

  // A pending ticket has no embedding yet, so "none found" would be misleading.
  it("distinguishes a still-indexing ticket from an empty result", async () => {
    respond({ similar: [] });
    render(<SimilarTickets ticketId="t1" aiStatus="PENDING" onOpen={vi.fn()} />);
    expect(await screen.findByText("Indexing this ticket…")).toBeInTheDocument();
  });

  it("surfaces a failed request instead of rendering nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    render(<SimilarTickets ticketId="t1" aiStatus="DONE" onOpen={vi.fn()} />);
    expect(await screen.findByText("Couldn't load similar tickets.")).toBeInTheDocument();
  });

  // With no AI service configured the feature does not exist; stay out of the way.
  it("renders nothing when AI is switched off and there is nothing to show", async () => {
    const fetchMock = respond({ similar: [] });
    const { container } = render(<SimilarTickets ticketId="t1" aiStatus={null} onOpen={vi.fn()} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
