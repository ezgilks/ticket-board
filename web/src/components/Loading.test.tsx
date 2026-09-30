import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { SLOW_AFTER_MS } from "../lib/slowRequests";
import { ColdStartBanner } from "./Loading";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A fetch that stays pending until the test resolves it, like a sleeping server. */
function hangingFetch() {
  let respond: () => void = () => {};
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () => new Promise((resolve) => (respond = () => resolve(new Response("{}", { status: 200 })))),
  );
  return () => respond();
}

describe("ColdStartBanner", () => {
  it("stays hidden for a normal, quick request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    render(<ColdStartBanner />);
    await act(() => api("GET", "/boards"));
    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS + 100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("appears once a request has been pending a while, and goes when it finishes", async () => {
    const respond = hangingFetch();
    render(<ColdStartBanner />);
    let request: Promise<unknown> = Promise.resolve();
    act(() => {
      request = api("GET", "/boards");
    });

    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(screen.getByRole("status")).toHaveTextContent("Waking up the server");

    await act(async () => {
      respond();
      await request;
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
