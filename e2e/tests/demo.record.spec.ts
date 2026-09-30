import { mkdirSync, rmSync } from "node:fs";
import { type Page, test } from "@playwright/test";
import { card, column, newUser } from "./helpers";

// Not a test: records the README demo. Two users side by side; one drags a card and creates
// a ticket, the other's screen follows live. Frames are written to demo-frames/ and stitched
// into docs/demo.gif by scripts/make_gif.py. Run with `npm run demo-gif`.
test.skip(!process.env["RECORD_DEMO"], "only runs with RECORD_DEMO=1");

const OUT = "demo-frames";
const VIEWPORT = { width: 1000, height: 540 };

test("record the README demo", async ({ browser }) => {
  test.setTimeout(120_000);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const alice = await newUser(browser, "Alice");
  const bob = await newUser(browser, "Bob");
  await alice.page.setViewportSize(VIEWPORT);
  await bob.page.setViewportSize(VIEWPORT);
  const boardId = await alice.demoBoardId();
  await alice.api("POST", `/boards/${boardId}/members`, { email: bob.email });
  await alice.api("PATCH", `/boards/${boardId}`, { name: "Launch plan" });

  for (const u of [alice, bob]) await u.page.goto(`/boards/${boardId}`);
  await bob.page.getByText("2 viewing").waitFor();

  let n = 0;
  /** One frame = both screens at this instant. `hold` repeats it (the GIF has no per-frame delay here). */
  const frame = async (hold = 1) => {
    const a = await alice.page.screenshot();
    const b = await bob.page.screenshot();
    for (let i = 0; i < hold; i++) {
      const id = String(n++).padStart(4, "0");
      await Promise.all([
        import("node:fs/promises").then((fs) => fs.writeFile(`${OUT}/${id}-a.png`, a)),
        import("node:fs/promises").then((fs) => fs.writeFile(`${OUT}/${id}-b.png`, b)),
      ]);
    }
  };

  await frame(8); // opening hold

  // Alice drags a card to Done, frame by frame so the motion shows.
  await dragRecorded(alice.page, card(alice.page, "Checkout page takes 8 seconds to load"), column(alice.page, "Done"), frame);
  for (let i = 0; i < 6; i++) {
    await bob.page.waitForTimeout(120);
    await frame();
  }
  await frame(6);

  // Alice adds a ticket; it appears on Bob's screen.
  await column(alice.page, "To Do").getByRole("button", { name: "+ Add ticket" }).click();
  await frame(2);
  const input = alice.page.getByLabel("Ticket title");
  for (const ch of "Payment webhook times out") {
    await input.press(ch === " " ? "Space" : ch);
    await frame();
  }
  await input.press("Enter");
  for (let i = 0; i < 6; i++) {
    await bob.page.waitForTimeout(120);
    await frame();
  }
  await bob.page.getByText("Payment webhook times out").waitFor();
  await frame(14); // closing hold
});

async function dragRecorded(
  page: Page,
  source: ReturnType<typeof card>,
  target: ReturnType<typeof column>,
  frame: (hold?: number) => Promise<void>,
) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("not visible");
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + 60 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y, { steps: 3 });
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await page.mouse.move(start.x + (end.x - start.x) * ease, start.y + (end.y - start.y) * ease);
    await frame();
  }
  await page.mouse.up();
}
