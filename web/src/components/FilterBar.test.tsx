import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type BoardFilter, EMPTY_FILTER } from "../lib/boardFilter";
import type { Member } from "../lib/types";
import { FilterBar } from "./FilterBar";

const members: Member[] = [
  { userId: "u2", role: "MEMBER", user: { id: "u2", email: "b@test.com", name: "Bob" } },
  { userId: "u1", role: "OWNER", user: { id: "u1", email: "a@test.com", name: "Alice" } },
];

// FilterBar is controlled, so the test holds the state the way BoardPage does.
function Harness({ onFilter }: { onFilter?: (f: BoardFilter) => void }) {
  const [filter, setFilter] = useState(EMPTY_FILTER);
  return (
    <>
      <FilterBar
        filter={filter}
        onChange={(f) => {
          setFilter(f);
          onFilter?.(f);
        }}
        labels={["bug", "feature"]}
        members={members}
        currentUserId="u1"
        shown={2}
        total={9}
      />
      <input aria-label="elsewhere" />
    </>
  );
}

describe("FilterBar", () => {
  it("focuses search on '/', but not while typing in another field", async () => {
    render(<Harness />);
    await userEvent.keyboard("/");
    expect(screen.getByLabelText("Search tickets")).toHaveFocus();

    await userEvent.click(screen.getByLabelText("elsewhere"));
    await userEvent.keyboard("/");
    expect(screen.getByLabelText("elsewhere")).toHaveValue("/");
  });

  it("toggles chips and shows the match count with a Clear button", async () => {
    let last = EMPTY_FILTER;
    render(<Harness onFilter={(f) => (last = f)} />);
    expect(screen.queryByText("2 of 9 tickets")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "high" }));
    await userEvent.click(screen.getByRole("button", { name: "#bug" }));
    expect(last).toMatchObject({ priorities: ["HIGH"], labels: ["bug"] });
    expect(screen.getByRole("button", { name: "high" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 of 9 tickets")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(last).toEqual(EMPTY_FILTER);
  });

  it("lists the current user first as 'Me'", () => {
    render(<Harness />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Anyone", "Unassigned", "Me (Alice)", "Bob"]);
  });
});
