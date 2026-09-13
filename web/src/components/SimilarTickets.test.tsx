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
    render(<SimilarTickets ticketId="t1" onOpen={onOpen} />);

    expect(await screen.findByText("Can't sign in")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Can't sign in"));
    expect(onOpen).toHaveBeenCalledWith("s1");
  });

  it("renders nothing when there are no matches", async () => {
    const fetchMock = respond({ similar: [] });
    const { container } = render(<SimilarTickets ticketId="t1" onOpen={vi.fn()} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
