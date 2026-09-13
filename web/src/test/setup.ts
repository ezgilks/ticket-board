import "@testing-library/jest-dom/vitest"; // adds matchers like toBeInTheDocument()
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
