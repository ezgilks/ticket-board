import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, describeError } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeError", () => {
  it("passes our API's own messages through as sentences", () => {
    expect(describeError(new ApiError(400, "No user with that email"))).toBe("No user with that email.");
  });

  it("never shows a raw status code for server failures", () => {
    const text = describeError(new ApiError(502, "Request failed (502)"));
    expect(text).not.toMatch(/502/);
    expect(text).toMatch(/server isn't responding/);
  });

  it("explains rate limiting", () => {
    expect(describeError(new ApiError(429, "Too many attempts, try again later"))).toMatch(/Wait a few minutes/);
  });

  it("translates fetch's network failure", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toBe("Can't reach the server. Try again in a moment.");
  });

  it("says so when the browser is offline, whatever the error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(describeError(new ApiError(500, "x"))).toMatch(/offline/);
  });
});
