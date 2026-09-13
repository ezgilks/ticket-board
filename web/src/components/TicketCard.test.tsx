import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ticket } from "../test/fixtures";
import { TicketCard } from "./TicketCard";

// useSortable needs dnd-kit's providers. Same sensor config as BoardPage: a drag only
// starts after 5px of movement, so a plain click still reaches onClick.
function Dnd({ children }: { children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

function renderCard(t = ticket({ id: "t1", columnId: "c1" }), onOpen = vi.fn()) {
  render(
    <Dnd>
      <SortableContext items={[t.id]}>
        <TicketCard ticket={t} onOpen={onOpen} />
      </SortableContext>
    </Dnd>,
  );
  return onOpen;
}

describe("TicketCard", () => {
  it("shows title, priority, labels and assignee initial", () => {
    renderCard(
      ticket({
        id: "t1",
        columnId: "c1",
        title: "Fix login",
        priority: "URGENT",
        labels: ["auth", "bug"],
        assignee: { id: "u1", name: "grace", email: "g@x.com" },
      }),
    );
    expect(screen.getByText("Fix login")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
    expect(screen.getByText("auth")).toBeInTheDocument();
    expect(screen.getByTitle("grace")).toHaveTextContent("G");
  });

  it("marks tickets the AI triaged, but not ones where nothing was applied", () => {
    renderCard(
      ticket({
        id: "t1",
        columnId: "c1",
        aiTriage: { labels: ["bug"], priority: "HIGH", provider: "gemini", applied: ["priority"] },
      }),
    );
    expect(screen.getByText("✦ AI")).toBeInTheDocument();
  });

  it("hides the AI mark when the suggestion wasn't applied", () => {
    renderCard(
      ticket({
        id: "t1",
        columnId: "c1",
        aiTriage: { labels: [], priority: "HIGH", provider: "gemini", applied: [] },
      }),
    );
    expect(screen.queryByText("✦ AI")).not.toBeInTheDocument();
  });

  it("opens on click", async () => {
    const t = ticket({ id: "t1", columnId: "c1", title: "Click me" });
    const onOpen = renderCard(t);
    await userEvent.click(screen.getByText("Click me"));
    expect(onOpen).toHaveBeenCalledWith(t);
  });
});
