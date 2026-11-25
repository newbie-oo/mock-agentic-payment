import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
const dir = mkdtempSync(join(tmpdir(), "paypilot-browser-"));
const port = process.env.SMOKE_PORT || "3481";
const base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  DATABASE_URL: "file:" + dir + "/smoke.db",
  OPENAI_API_KEY: "",
};
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
execFileSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env });
const app = spawn(
  "node_modules/.bin/next",
  ["start", "-H", "127.0.0.1", "-p", port],
  { env, stdio: "inherit" },
);
const exit = once(app, "exit");
try {
  for (let i = 0; i < 50; i++) {
    if (app.exitCode !== null) throw Error("Server startup failed");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    const page = await browser.newPage();
    await page.goto(base);
    const revenue = () =>
      page
        .locator(".stats article")
        .first()
        .locator("b")
        .innerText()
        .then((v) => Number(v.replace(/[^\d.]/g, "")));
    const before = await revenue();
    await page.getByRole("link", { name: "Review collections" }).click();
    await page
      .getByRole("button", { name: "Review outstanding payments" })
      .click();
    await page.getByRole("button", { name: "Approve all eligible" }).click();
    await page.getByText("0 awaiting approval · 4 executed").waitFor();
    assert.equal(await page.getByText(/Verified saved reminder/).count(), 2);
    await page.getByText("Open verified checkout").first().click();
    await page.getByRole("button", { name: "Simulate checkout" }).waitFor();
    const api = await page.request.post(base + "/api/agent", {
      data: {
        prompt: "สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้",
      },
    });
    assert.equal(api.status(), 201);
    const run = await api.json();
    const action = run.actions.find(
      (a: { status: string }) => a.status === "PROPOSED",
    );
    await page.goto(base + "/assistant?run=" + run.id);
    await page.getByText("Action " + action.id).waitFor();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByText("Open verified checkout").waitFor();
    const inspected = await (
      await page.request.get(base + "/api/run?id=" + run.id)
    ).json();
    const verified = inspected.actions.find(
      (a: { id: string }) => a.id === action.id,
    );
    assert.equal(
      await page.getByText("Open verified checkout").getAttribute("href"),
      verified.checkoutUrl,
    );
    const retry = await (
      await page.request.post(base + "/api/decision", {
        data: { actionId: action.id, approve: true },
      })
    ).json();
    assert.equal(retry.checkoutUrl, verified.checkoutUrl);
    await page.getByText("Open verified checkout").click();
    await page.getByRole("button", { name: "Simulate checkout" }).click();
    await page.getByText("Paid in full").waitFor();
    await page.reload();
    await page.getByText("Paid in full").waitFor();
    await page.goto(base);
    assert.equal((await revenue()) - before, 5000);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    console.log(
      "Browser verified two reminders, replacement checkout, Bangkok creation, single ฿5,000 settlement and mobile overview.",
    );
  } finally {
    await browser.close();
  }
} finally {
  app.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
