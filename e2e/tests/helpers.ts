import { type Browser, expect, type Locator, type Page } from "@playwright/test";

// Accounts are created through the API, then the browser is signed in by planting the
// token where the app keeps it. Going through the sign-up form every time would be slow
// and would test the form over and over; the tests that care about the form use it.

let counter = 0;

export interface TestUser {
  page: Page;
  name: string;
  email: string;
  id: string;
  /** Authenticated call straight to the API, for setup that isn't what the test is about. */
  api: (method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown) => Promise<unknown>;
  /** The demo board every new account gets. */
  demoBoardId: () => Promise<string>;
}

export async function newUser(browser: Browser, name: string): Promise<TestUser> {
  const context = await browser.newContext();
  const page = await context.newPage();
  counter += 1;
  const email = `${name.toLowerCase()}-${Date.now()}-${counter}@e2e.test`;

  const res = await page.request.post("/api/auth/register", { data: { email, password: "password123", name } });
  expect(res.status(), await res.text()).toBe(201);
  const { token, user } = await res.json();
  await context.addInitScript((t) => window.localStorage.setItem("ticketboard.token", t), token);

  const api: TestUser["api"] = async (method, path, data) => {
    const r = await page.request.fetch(`/api${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.ok(), `${method} ${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
    return r.status() === 204 ? undefined : r.json();
  };
  const demoBoardId = async () => {
    const { boards } = (await api("GET", "/boards")) as { boards: { id: string }[] };
    return boards[0]?.id as string;
  };
  return { page, name, email, id: user.id, api, demoBoardId };
}

export const column = (page: Page, name: string) => page.getByRole("region", { name });
export const card = (page: Page, title: string) => page.getByRole("button", { name: title, exact: false }).filter({ hasText: title });

/**
 * Drag with real mouse events. dnd-kit starts a drag only after the pointer moves 5px,
 * so the first small move "picks up" the card, then it glides to the target.
 */
export async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag: element not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}
