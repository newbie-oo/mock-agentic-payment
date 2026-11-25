import type { Browser } from "@playwright/test";
import assert from "node:assert/strict";

// The smoke server starts with a new, unmigrated SQLite file.
export async function checkDashboardStates(
  browser: Browser,
  base: string,
  migrate: () => void,
) {
  const pages = [];
  try {
    for (const width of [1280, 390]) {
      const viewport = { width, height: 844 };
      // Hold the streamed shell before hydration activates the error boundary.
      const shell = await browser.newPage({
        viewport,
        javaScriptEnabled: false,
      });
      try {
        await shell.goto(base);
        await shell
          .getByRole("status")
          .filter({ hasText: "Loading workspace…" })
          .waitFor();
      } finally {
        await shell.close();
      }
      const page = await browser.newPage({ viewport });
      pages.push(page);
      await page.goto(base);
      await page
        .getByRole("heading", { name: "Workspace unavailable" })
        .waitFor();
    }
    migrate();
    for (const page of pages) {
      await page.getByRole("button", { name: "Try again" }).click();
      await page.getByText("No attempts yet", { exact: false }).waitFor();
      await page
        .getByText("No settled payments in the last 14 days.")
        .waitFor();
      await page.getByText("No transactions on this page.").waitFor();
      assert.deepEqual(await page.locator(".stats b").allTextContents(), [
        "฿0",
        "0",
        "฿0",
        "0",
      ]);
      assert.doesNotMatch(await page.locator("main").innerText(), /NaN/);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
}
