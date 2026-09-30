import { expect, test } from "@playwright/test";
import { card, column, drag, newUser } from "./helpers";

test("Try the demo: one click from the login page to a populated board", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Try the demo/ }).click();

  await expect(page).toHaveURL(/\/boards\//);
  await expect(page.getByText("You're exploring as a guest")).toBeVisible();
  await expect(card(page, "Users can't sign in on Safari")).toBeVisible();
  await expect(page.getByText(/^Guest \d{4}$/).first()).toBeVisible();
});

test("a drag on one screen moves the card on a teammate's screen, live", async ({ browser }) => {
  const alice = await newUser(browser, "Alice");
  const bob = await newUser(browser, "Bob");
  const boardId = await alice.demoBoardId();
  await alice.api("POST", `/boards/${boardId}/members`, { email: bob.email });

  await alice.page.goto(`/boards/${boardId}`);
  await bob.page.goto(`/boards/${boardId}`);
  await expect(bob.page.getByText("2 viewing")).toBeVisible(); // presence over the socket

  const title = "Add CSV export to the reports page";
  await drag(alice.page, card(alice.page, title), column(alice.page, "Done"));

  // Bob never reloads: the move arrives over the socket.
  await expect(column(bob.page, "Done").getByText(title)).toBeVisible();
  await expect(column(bob.page, "To Do").getByText(title)).toHaveCount(0);

  // And it was saved, not just shown.
  await bob.page.reload();
  await expect(column(bob.page, "Done").getByText(title)).toBeVisible();
});

test("search and filters narrow the board and live in the URL", async ({ browser }) => {
  const alice = await newUser(browser, "Alice");
  const { page } = alice;
  await page.goto(`/boards/${await alice.demoBoardId()}`);
  await expect(card(page, "Checkout page takes 8 seconds to load")).toBeVisible();

  await page.keyboard.press("/");
  await page.keyboard.type("safari");
  await expect(page).toHaveURL(/q=safari/);
  await expect(page.getByText("2 of 9 tickets")).toBeVisible();
  await expect(card(page, "Checkout page takes 8 seconds to load")).toHaveCount(0);

  // A filtered view survives a reload, because the URL is the state.
  await page.reload();
  await expect(page.getByText("2 of 9 tickets")).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(card(page, "Checkout page takes 8 seconds to load")).toBeVisible();
  await expect(page).not.toHaveURL(/q=/);
});
