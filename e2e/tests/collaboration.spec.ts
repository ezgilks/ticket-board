import { expect, test } from "@playwright/test";
import { card, newUser } from "./helpers";

test("two people edit one ticket: the second save is caught, not lost", async ({ browser }) => {
  const alice = await newUser(browser, "Alice");
  const bob = await newUser(browser, "Bob");
  const boardId = await alice.demoBoardId();
  await alice.api("POST", `/boards/${boardId}/members`, { email: bob.email });
  const title = "Dark mode toggle resets on reload";

  // Both open the same ticket.
  for (const u of [alice, bob]) {
    await u.page.goto(`/boards/${boardId}`);
    await card(u.page, title).click();
    await expect(u.page.getByRole("dialog", { name: "Edit ticket" })).toBeVisible();
  }

  // Bob starts typing, but Alice saves first.
  await bob.page.getByLabel("Title").fill("Bob's title");
  await alice.page.getByLabel("Priority").selectOption("HIGH");
  await alice.page.getByRole("button", { name: "Save" }).click();

  // Bob is told, live, and keeps what he typed.
  const banner = bob.page.getByText("This ticket was changed while you were editing");
  await expect(banner).toBeVisible();
  await expect(bob.page.getByLabel("Title")).toHaveValue("Bob's title");

  // A plain save is refused by the server (409) and the modal stays open.
  const conflict = bob.page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 409);
  await bob.page.getByRole("button", { name: "Save" }).click();
  await conflict;
  await expect(banner).toBeVisible();

  // Overwriting is a deliberate choice, and then it saves.
  await bob.page.getByRole("button", { name: "Overwrite with mine" }).click();
  await expect(bob.page.getByRole("dialog", { name: "Edit ticket" })).toHaveCount(0);
  await expect(card(alice.page, "Bob's title")).toBeVisible(); // live on Alice's screen
});

test("invite someone with no account: link → sign up → on the board", async ({ browser }) => {
  const alice = await newUser(browser, "Alice");
  const boardId = await alice.demoBoardId();
  const { page } = alice;
  await page.goto(`/boards/${boardId}`);

  const newcomer = `newcomer-${Date.now()}@e2e.test`;
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByLabel("Email").fill(newcomer);
  await page.getByRole("button", { name: "Invite" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(newcomer)).toHaveCount(2); // the message and the pending list

  // A stranger opens the link in a fresh browser, signed out.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(link);
  await expect(stranger.getByText("Alice invited you to join Demo board.")).toBeVisible();
  await stranger.getByRole("button", { name: "Create an account to join" }).click();
  await expect(stranger.getByLabel("Email")).toHaveValue(newcomer);
  await stranger.getByLabel("Name").fill("Newcomer");
  await stranger.getByLabel("Password").fill("password123");
  await stranger.getByRole("button", { name: "Create account" }).click();
  await stranger.getByRole("button", { name: "Join as Newcomer" }).click();
  await expect(stranger).toHaveURL(new RegExp(`/boards/${boardId}`));
  await expect(card(stranger, "Users can't sign in on Safari")).toBeVisible();

  // The link worked once and is now dead.
  await stranger.goto(link);
  await expect(stranger.getByRole("alert")).toContainText("already used");
});

test("a removed member's open tab is kicked out immediately", async ({ browser }) => {
  const alice = await newUser(browser, "Alice");
  const bob = await newUser(browser, "Bob");
  const boardId = await alice.demoBoardId();
  await alice.api("POST", `/boards/${boardId}/members`, { email: bob.email });

  await bob.page.goto(`/boards/${boardId}`);
  await expect(card(bob.page, "Users can't sign in on Safari")).toBeVisible();

  await alice.page.goto(`/boards/${boardId}`);
  await alice.page.getByRole("button", { name: "Settings" }).click();
  await alice.page.getByRole("button", { name: "Remove Bob" }).click();
  await alice.page.getByRole("dialog", { name: "Remove Bob?" }).getByRole("button", { name: "Remove" }).click();

  // Bob didn't reload anything.
  await expect(bob.page.getByText("You were removed from this board.")).toBeVisible();
  await expect(bob.page).toHaveURL(/\/$/);
});
