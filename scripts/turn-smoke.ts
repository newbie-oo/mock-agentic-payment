import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { Page } from "@playwright/test";
import type { RunDTO } from "../lib/contract";

export async function checkAssistantTurns(
  page: Page,
  base: string,
  dbFile: string,
) {
  const db = new DatabaseSync(dbFile);
  const counts = () =>
    ['"Order"', "Link", "Attempt", "Notification"].map((table) =>
      Number(db.prepare("SELECT COUNT(*) AS n FROM " + table).get()!.n),
    );
  async function agent(prompt: string, runId?: string) {
    const response = await page.request.post(base + "/api/agent", {
      data: { prompt, runId },
    });
    assert.ok(response.ok());
    const run: RunDTO = await response.json();
    const readback = await page.request.get(base + "/api/run?id=" + run.id);
    assert.deepEqual(await readback.json(), run);
    return run;
  }
  async function approve(id: string) {
    const r = await page.request.post(base + "/api/decision", {
      data: { actionId: id, approve: true },
    });
    assert.ok(r.ok());
    return r.json();
  }
  const pending = (r: RunDTO) =>
    r.actions.filter((a) => a.status === "PROPOSED");
  const text = "ลิ้ง ค่าบัตร 6000 เอ จ่าย";
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base + "/assistant");
    const desktopBefore = counts();
    const desktopInput = page.locator("#prompt");
    const single = "ลิ้งรับเงิน 1000 ลูกค้า A ค่า gas";
    await desktopInput.fill(single);
    const previewResponse = page.waitForResponse((r) =>
      r.url().endsWith("/api/agent"),
    );
    await desktopInput.press("Enter");
    const singleRun: RunDTO = await (await previewResponse).json();
    const action = pending(singleRun)[0];
    assert.equal(singleRun.status, "AWAITING_APPROVAL");
    assert.deepEqual(
      [
        action.payload.customer,
        action.amountMinor,
        action.payload.description,
        action.payload.methods,
      ],
      ["A", 100000, "ค่า gas", ["QR"]],
    );
    assert.equal(
      Date.parse(action.payload.expires!) - Date.parse(singleRun.createdAt),
      86400000,
    );
    await page.getByText(single, { exact: true }).waitFor();
    await page
      .locator(".proposal")
      .getByText("A · ฿1,000 · ค่า gas", { exact: true })
      .waitFor();
    assert.deepEqual(counts(), desktopBefore);
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
    const checkoutAnchor = page.getByRole("link", {
      name: /Open verified checkout/,
    });
    await checkoutAnchor.waitFor();
    const receipt = await approve(action.id);
    assert.equal(
      await checkoutAnchor.getAttribute("href"),
      receipt.checkoutUrl,
    );
    const verified = await (
      await page.request.get(base + "/api/link?id=" + receipt.result.id)
    ).json();
    assert.deepEqual(
      [
        verified.order.amount,
        verified.order.customer,
        verified.order.description,
        verified.methods,
      ],
      [100000, "A", "ค่า gas", "QR"],
    );
    assert.deepEqual(counts(), [
      desktopBefore[0] + 1,
      desktopBefore[1] + 1,
      ...desktopBefore.slice(2),
    ]);
    const dbOrder = db
      .prepare('SELECT customer,amount,description FROM "Order" WHERE id=?')
      .get(verified.order.id);
    assert.deepEqual(
      { ...dbOrder },
      { customer: "A", amount: 100000, description: "ค่า gas" },
    );
    console.log("Desktop single-turn confirmation", {
      run: singleRun.id,
      action: action.id,
      checkout: receipt.checkoutUrl,
      amount: verified.order.amount,
    });
    const before = counts();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/assistant");
    const input = page.locator("#prompt");
    await input.fill(text);
    // Pause the intercepted submission until the in-composer pending status is visible.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    await page.route(
      "**/api/agent",
      async (route) => {
        await gate;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await input.press("Enter");
    await page.getByRole("status").filter({ hasText: "กำลังส่งคำขอ" }).waitFor();
    release();
    await page
      .getByRole("alert")
      .filter({ hasText: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" })
      .waitFor();
    assert.equal(await input.inputValue(), text);
    let response = page.waitForResponse((r) => r.url().endsWith("/api/agent"));
    await page.getByRole("button", { name: /Run assistant/ }).click();
    const first: RunDTO = await (await response).json();
    await page.getByRole("heading", { name: "ขอข้อมูลเพิ่มเติม" }).waitFor();
    assert.match(await page.locator(".summary").innerText(), /6,000 บาท.*ชื่อเอ/);
    await page.getByText("รอคำตอบจากคุณ", { exact: true }).waitFor();
    assert.equal(
      await input.evaluate((e) => e === document.activeElement),
      true,
    );
    if (process.env.ASSISTANT_SCREENSHOT)
      await page.screenshot({
        path: process.env.ASSISTANT_SCREENSHOT,
        fullPage: true,
      });
    await page.getByRole("button", { name: "แก้ไขรายละเอียด" }).click();
    assert.equal(
      await input.evaluate((e) => e === document.activeElement),
      true,
    );
    await page.reload();
    await page.getByText(text, { exact: true }).waitFor();
    let committed: RunDTO | undefined;
    let lostRequestId = "";
    await page.route(
      "**/api/agent",
      async (route) => {
        lostRequestId = route.request().postDataJSON().requestId;
        const sent = await route.fetch();
        assert.equal(sent.status(), 200);
        committed = await sent.json();
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "ใช่ ตามนี้" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" })
      .waitFor();
    assert.equal(await input.inputValue(), "ใช่ ตามนี้");
    response = page.waitForResponse((r) => r.url().endsWith("/api/agent"));
    await page.getByRole("button", { name: "ส่งคำตอบ", exact: true }).click();
    const confirmed: RunDTO = await (await response).json();
    assert.equal(confirmed.id, first.id);
    assert.ok(committed);
    assert.deepEqual(pending(confirmed), pending(committed));
    assert.equal(confirmed.prompt.split("\n").length, 2);
    const conflict = await page.request.post(base + "/api/agent", {
      data: {
        runId: first.id,
        prompt: "another amount",
        requestId: lostRequestId,
      },
    });
    assert.equal(conflict.status(), 409);
    assert.equal(pending(confirmed)[0].amountMinor, 600000);
    assert.equal(pending(confirmed)[0].payload.customer, "เอ");
    assert.deepEqual(pending(confirmed)[0].payload.methods, ["QR"]);
    assert.deepEqual(counts(), before);
    await page.getByText("รอตรวจและอนุมัติข้อเสนอ", { exact: true }).waitFor();
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
    await page.getByText("สร้างลิงก์แล้ว · เปิดหรือคัดลอกลิงก์ด้านล่าง").waitFor();
    const checkout = await page
      .getByRole("link", { name: /Open verified checkout/ })
      .getAttribute("href");
    await page.getByText(base + checkout!, { exact: true }).waitFor();
    const paidTerms = await (
      await page.request.get(
        base + "/api/link?id=" + checkout!.split("/").at(-1),
      )
    ).json();
    assert.equal(paidTerms.order.amount, 600000);
    assert.equal(paidTerms.methods, "QR");
    assert.deepEqual(counts(), [
      before[0] + 1,
      before[1] + 1,
      ...before.slice(2),
    ]);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    console.log("390px shorthand", {
      run: first.id,
      checkout,
      amount: paidTerms.order.amount,
      methods: paidTerms.methods,
    });

    const initial = counts();
    const missing = await agent("ช่วยเตรียมข้อความทวงลูกค้าชื่อวิชัย ยังไม่ส่ง");
    assert.match(missing.summary, /ไม่พบ.*วิชัย/);
    assert.doesNotMatch(missing.summary, /นภัส|4,700|สวัสดี/);
    const house = await agent("ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000");
    const deposit = await agent(
      "รับเงินมัดจำจากลูกค้าชื่อวิชัย แต่เก็บมัดจำแค่ 500 บาท",
      house.id,
    );
    const snapshot = pending(deposit)[0];
    assert.equal(snapshot.payload.customer, "วิชัย");
    assert.equal(snapshot.amountMinor, 50000);
    const deny = await agent("ไม่เอา QR", house.id);
    assert.equal(pending(deny).length, 0);
    assert.equal((await approve(snapshot.id)).status, "REJECTED");
    await page.goto(base + "/assistant?run=" + house.id);
    await input.fill("ขอใช้บัตร");
    response = page.waitForResponse((r) => r.url().endsWith("/api/agent"));
    await input.press("Enter");
    const amended: RunDTO = await (await response).json();
    assert.deepEqual(counts(), initial);
    const decision = await approve(pending(amended)[0].id);
    assert.deepEqual(await approve(pending(amended)[0].id), decision);
    const lookup = await (
      await page.request.get(base + "/api/link?id=" + decision.result.id)
    ).json();
    assert.deepEqual(
      [lookup.order.customer, lookup.order.amount, lookup.methods],
      ["วิชัย", 50000, "CARD"],
    );
    const found = await agent("ช่วยเตรียมข้อความทวงลูกค้าชื่อวิชัย ยังไม่ส่ง");
    assert.match(found.summary, /คุณวิชัย.*500 บาท/);
    assert.doesNotMatch(found.summary, /นภัส|4,700/);
    const another = await agent("สร้างลิงก์ 3,200 บาท ค่าเช่า จากคุณวิชัย");
    const second = await approve(pending(another)[0].id);
    const multi = await agent("ช่วยร่างข้อความทวงลูกค้าชื่อวิชัย ยังไม่ส่ง");
    assert.equal(multi.status, "NEEDS_INPUT");
    assert.match(multi.summary, /หลายออเดอร์/);
    assert.doesNotMatch(multi.summary, /สวัสดี|500 บาท|3,200 บาท/);
    const pick = await agent(second.result.orderId, multi.id);
    assert.match(pick.summary, /คุณวิชัย.*3,200 บาท/);
    assert.doesNotMatch(pick.summary, /500 บาท|นภัส/);
    assert.deepEqual(counts(), [
      initial[0] + 2,
      initial[1] + 2,
      ...initial.slice(2),
    ]);
    console.log("Corrected deposit and scoped reminders", {
      order: lookup.order.id,
      amount: lookup.order.amount,
      methods: lookup.methods,
      notificationsDelta: counts()[3] - initial[3],
    });
  } finally {
    db.close();
  }
}
