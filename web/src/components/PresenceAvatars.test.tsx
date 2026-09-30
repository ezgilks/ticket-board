import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PresenceAvatars } from "./PresenceAvatars";
import type { User } from "../lib/types";

const user = (id: string, name: string): User => ({ id, email: `${id}@test.com`, name });

describe("PresenceAvatars", () => {
  it("renders nothing when nobody is connected", () => {
    const { container } = render(<PresenceAvatars users={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says 'only you' rather than '1 viewing' when alone", () => {
    render(<PresenceAvatars users={[user("u1", "Alice")]} currentUserId="u1" />);
    expect(screen.getByText("only you")).toBeInTheDocument();
  });

  it("shows an initial per viewer and a count", () => {
    render(<PresenceAvatars users={[user("u1", "Alice"), user("u2", "bob")]} currentUserId="u1" />);
    expect(screen.getByText("2 viewing")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument(); // lowercase names still uppercase
  });

  // Avatars are capped so a busy board doesn't push the header around.
  it("collapses viewers beyond the cap into a +N chip", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((c) => user(c, c.toUpperCase()));
    render(<PresenceAvatars users={many} currentUserId="a" />);
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("6 viewing")).toBeInTheDocument();
  });
});
