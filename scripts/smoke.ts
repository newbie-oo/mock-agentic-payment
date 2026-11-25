import { DatabaseSync } from "node:sqlite";
import { checkDashboardStates } from "./dashboard-states";
import { checkoutStates } from "./checkout-states";
import { checkAssistantTurns } from "./turn-smoke";
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
      if ((await fetch(base + "/assistant")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  try {
    await checkDashboardStates(browser, base, () => {
      execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
    });
    execFileSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env });
    const page = await browser.newPage();
    await checkoutStates(page, base, dir + "/smoke.db");
    await page.setViewportSize({ width: 1280, height: 900 });
    const started = performance.now();
    await page.goto(base);
    const revenue = () =>
      page
        .locator(".stats article")
        .first()
        .locator("b")
        .innerText()
        .then((v) => Number(v.replace(/[^\d.]/g, "")));
    const before = await revenue();
    assert.equal(before, 34600);
    await page
      .getByText("64.0% success · 16 settlements / 25 recorded attempts")
      .waitFor();
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
    await page
      .getByRole("button", { name: "อนุมัติและสร้างลิงก์", exact: true })
      .click();
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
    for (const outcome of ["FAILED", "FAILED", "SUCCESS"]) {
      await page.getByLabel("Sandbox outcome").selectOption(outcome);
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout"),
      );
      await page.getByRole("button", { name: "Simulate checkout" }).click();
      const receipt = await response;
      assert.equal(receipt.status(), 200);
      const attempt = await receipt.json();
      assert.equal(attempt.status, outcome);
      if (outcome === "FAILED") {
        await page.getByText("Recorded failed · " + attempt.id).waitFor();
        assert.equal(
          (await (await page.request.get(base + "/api/dashboard")).json())
            .revenue,
          before * 100,
        );
      } else {
        const replay = await page.request.post(base + "/api/checkout", {
          data: receipt.request().postDataJSON(),
        });
        assert.equal((await replay.json()).id, attempt.id);
      }
    }
    await page.getByText("Paid in full").waitFor();
    await page.reload();
    await page.getByText("Paid in full").waitFor();
    await page.goto(base);
    assert.equal((await revenue()) - before, 5000);
    await page.getByRole("img", { name: /Daily revenue:.*฿5,000/ }).waitFor();
    await page
      .getByText("60.7% success · 17 settlements / 28 recorded attempts")
      .waitFor();
    await page
      .getByText("Failed attempts")
      .locator("..")
      .getByText("5", { exact: true })
      .waitFor();
    assert.deepEqual(
      await page
        .locator("tbody tr .status")
        .allTextContents()
        .then((rows) => rows.slice(0, 3)),
      ["success", "failed", "failed"],
    );
    const after = await revenue();
    const metrics = await (
      await page.request.get(base + "/api/dashboard")
    ).json();
    assert.deepEqual(
      [
        metrics.revenue,
        metrics.pending,
        metrics.success,
        metrics.failed,
        metrics.denominator,
      ],
      [after * 100, 3410000, 17, 5, 28],
    );
    for (const method of metrics.methods) {
      await page
        .getByText(
          method.method + " · " + method._count + " successful payments",
          { exact: true },
        )
        .waitFor();
    }

    await page.getByRole("link", { name: "Review collections" }).click();
    await page
      .getByRole("button", { name: "Review outstanding payments" })
      .click();
    await page.getByText("4 awaiting approval · 0 executed").waitFor();
    assert.match(
      await page.locator(".summary").innerText(),
      /Recent invoice · wait/,
    );
    await page.getByRole("button", { name: "Approve all eligible" }).click();
    await page.getByText("0 awaiting approval · 4 executed").waitFor();
    assert.equal(await page.getByText(/Verified saved reminder/).count(), 2);
    const db = new DatabaseSync(dir + "/smoke.db", { readOnly: true });
    try {
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM Notification").get()!.n,
        2,
      );
      assert.deepEqual(
        db
          .prepare(
            "SELECT status FROM Attempt WHERE linkId = ? ORDER BY createdAt",
          )
          .all(verified.result.id)
          .map((row) => row.status),
        ["FAILED", "FAILED", "SUCCESS"],
      );
    } finally {
      db.close();
    }
    await page.getByText("Open verified checkout").first().click();
    await page.getByRole("button", { name: "Simulate checkout" }).waitFor();
    console.log(
      JSON.stringify({
        runId: run.id,
        actionId: action.id,
        checkoutUrl: verified.checkoutUrl,
        revenueBeforeBaht: before,
        revenueAfterBaht: after,
        automatedDemoSeconds: Number(
          ((performance.now() - started) / 1000).toFixed(2),
        ),
      }),
    );
    await page.goto(base + "/assistant");
    await page.waitForLoadState("networkidle");
    const field = page.getByLabel("Ask PayPilot");
    await field.fill("ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000");
    await field.press("Shift+Enter");
    assert.ok((await field.inputValue()).endsWith("\n"));
    const pendingResponse = page.waitForResponse((r) =>
      r.url().endsWith("/api/agent"),
    );
    await field.press("Enter");
    const clarification = await (await pendingResponse).json();
    assert.equal(clarification.status, "NEEDS_INPUT");
    await page.getByRole("heading", { name: "ขอข้อมูลเพิ่มเติม" }).waitFor();
    assert.match(await page.locator(".summary").innerText(), /ซื้อบ้านเอง/);
    await page.getByLabel("ตอบกลับ").fill("ใช่ เก็บค่าจอง 5,000 บาท จากสมชาย");
    const followResponse = page.waitForResponse((r) =>
      r.url().endsWith("/api/agent"),
    );
    await page.getByRole("button", { name: "ส่งคำตอบ" }).click();
    const follow = await (await followResponse).json();
    assert.equal(follow.runId, clarification.runId);
    assert.equal(
      follow.actions.find((a: { status: string }) => a.status === "PROPOSED")
        .amountMinor,
      500000,
    );
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
    await page.getByRole("link", { name: /Open verified checkout/ }).waitFor();
    await page.goto(base);
    await page.setViewportSize({ width: 390, height: 844 });
    // ResponsiveContainer redraws on ResizeObserver after the viewport changes.
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= window.innerWidth,
      undefined,
      { timeout: 5000 },
    );
    for (const path of ["/", "/transactions", "/links", "/assistant"]) {
      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await mobile.goto(base + path);
      await mobile.waitForLoadState("networkidle");
      await mobile.waitForFunction(
        () => document.documentElement.scrollWidth <= window.innerWidth,
        undefined,
        { timeout: 5000 },
      );
      await mobile.close();
    }
    await page.goto(base + "/links");
    await page.getByRole("button", { name: "Create payment link" }).click();
    const amount = page.getByRole("spinbutton", { name: "Amount" });
    await amount.fill("21474836.48");
    assert.ok(
      await amount.evaluate(
        (el: HTMLInputElement) => el.validity.rangeOverflow,
      ),
    );
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: base,
      });
    await page.getByRole("button", { name: "Copy link" }).first().click();
    assert.match(
      await page.evaluate(() => navigator.clipboard.readText()),
      /\/pay\//,
    );
    for (const prompt of [
      "สร้างลิงก์รับเงินค่าออกแบบ 5,000 บาท ให้ลูกค้าบริษัท แสงเช้า รับทั้งบัตรและ QR",
      "สร้างลิงก์เก็บเงินค่าออกแบบ 5000 บาท ให้ลูกค้าชื่อบริษัท แสงเช้า ชำระผ่าน QR และบัตร",
    ]) {
      const request = await page.request.post(base + "/api/agent", {
        data: { prompt },
      });
      const run = await request.json();
      const proposal = run.actions.find(
        (a: { status: string }) => a.status === "PROPOSED",
      );
      assert.equal(proposal.payload.customer, "บริษัท แสงเช้า");
      assert.equal(proposal.amountMinor, 500000);
      assert.deepEqual(proposal.payload.methods.sort(), ["CARD", "QR"]);
      const decision = await page.request.post(base + "/api/decision", {
        data: { actionId: proposal.id, approve: true },
      });
      const verified = await decision.json();
      const link = await (
        await page.request.get(base + "/api/link?id=" + verified.result.id)
      ).json();
      assert.equal(link.order.customer, "บริษัท แสงเช้า");
      assert.equal(link.order.amount, 500000);
      assert.deepEqual(link.methods.split(",").sort(), ["CARD", "QR"]);
      console.log(
        "Company readback",
        JSON.stringify({
          customer: link.order.customer,
          amount: link.order.amount,
          methods: link.methods,
        }),
      );
    }
    // Drop only the first reply after the server commits; the browser must replay the same attempt.
    const p = await page.request.post(base + "/api/proposal", {
      data: {
        kind: "create_payment_link",
        args: {
          customer: "Retry QA",
          description: "Lost response",
          amount: 500000,
        },
      },
    });
    const approved = await page.request.post(base + "/api/decision", {
      data: { actionId: (await p.json()).id, approve: true },
    });
    const link = (await approved.json()).result;
    const initial = await (
      await page.request.get(base + "/api/dashboard")
    ).json();
    for (const status of ["PENDING", "FAILED", "SUCCESS"]) {
      await page.goto(base + "/pay/" + link.id);
      await page.getByLabel("Sandbox outcome").selectOption(status);
      let requestId = "";
      await page.route(
        "**/api/checkout",
        async (route) => {
          requestId = route.request().postDataJSON().requestId;
          assert.equal((await route.fetch()).status(), 200);
          await route.abort("failed");
        },
        { times: 1 },
      );
      await page.getByRole("button", { name: "Simulate checkout" }).click();
      const retry = page.getByRole("button", { name: "Retry same attempt" });
      await retry.waitFor();
      if (status === "PENDING") {
        await page.reload();
        await retry.waitFor();
      }
      const result = page.waitForResponse((r) =>
        r.url().endsWith("/api/checkout"),
      );
      await retry.click();
      const attempt = await (await result).json();
      assert.equal(attempt.requestId, requestId);
      const actual = await (
        await page.request.get(base + "/api/transactions")
      ).json();
      assert.equal(
        actual.filter(
          (a: { linkId: string; status: string }) =>
            a.linkId === link.id && a.status === status,
        ).length,
        1,
      );
    }
    const final = await (
      await page.request.get(base + "/api/dashboard")
    ).json();
    const sum = (rows: { total: number }[]) =>
      rows.reduce((n, r) => n + r.total, 0);
    assert.equal(sum(final.trend) - sum(initial.trend), 500000);
    assert.equal(final.denominator - initial.denominator, 3);
    await checkAssistantTurns(page, base, dir + "/smoke.db");
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
