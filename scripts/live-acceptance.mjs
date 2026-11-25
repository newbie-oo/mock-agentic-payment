import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
assert.ok(
  process.env.OPENAI_API_KEY?.trim(),
  "Configure the authorized local provider first",
);
const dir = mkdtempSync(join(tmpdir(), "paypilot-live-")),
  port = process.env.LIVE_PORT || "3492",
  base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  DATABASE_URL: "file:" + join(dir, "qa.db"),
  QA_PROTOCOL_TRACE: join(dir, "protocol.jsonl"),
  NODE_OPTIONS:
    "--require=" +
    JSON.stringify(resolve("tests/language/clock.cjs")) +
    " --require=" +
    JSON.stringify(resolve("tests/language/provider-trace.cjs")),
};
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
execFileSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env });
function startApp() {
  return spawn(
    process.execPath,
    ["scripts/start.mjs", "-H", "127.0.0.1", "-p", port],
    { env, stdio: "ignore" },
  );
}
let app = startApp(),
  exit = once(app, "exit");
const db = new DatabaseSync(join(dir, "qa.db"));
const ledger = () =>
  ['"Order"', "Link", "Attempt", "Notification"].map(
    (t) => db.prepare("SELECT count(*) AS n FROM " + t).get().n,
  );
const pending = (r) => r.actions.filter((a) => a.status === "PROPOSED");
async function api(op, data) {
  const response = await fetch(
    base + "/api/" + op,
    data
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        }
      : {},
  );
  return { http: response.status, ...(await response.json()) };
}
const traces = [],
  cases = [];
async function scenario(name, fn) {
  const turns = [];
  const send = async (prompt, id) => {
    const r = await api("agent", { prompt, runId: id });
    assert.equal(r.mode, "Native provider");
    turns.push({
      prompt,
      status: r.status,
      http: r.http,
      run: r.id,
      summary: r.summary?.slice(0, 350),
      calls: r.providerCalls,
      turns: r.providerTurns,
      tools: r.actions.filter((a) => a.status === "EVENT").map((a) => a.kind),
      previews: pending(r).map((a) => ({
        kind: a.kind,
        amount: a.amountMinor,
        customer: a.payload.customer,
        methods: a.payload.methods,
        description: a.payload.description,
        expires: a.payload.expires,
      })),
    });
    assert.ok(r.http < 400, r.error || "Provider returned error");
    return r;
  };
  try {
    await fn(send);
    cases.push({ name, pass: true, turns });
  } catch (e) {
    cases.push({ name, pass: false, error: e.message.slice(0, 300), turns });
  }
  console.log(
    name,
    cases.at(-1).pass ? "passed" : "FAILED",
    turns.map((t) => t.status + " " + t.turns + "/" + t.calls).join(" → "),
  );
}
function preview(r, amount, customer, methods, description) {
  assert.equal(r.status, "AWAITING_APPROVAL");
  assert.equal(pending(r).length, 1);
  const a = pending(r)[0];
  assert.equal(a.amountMinor, amount);
  assert.equal(a.payload.customer, customer);
  assert.deepEqual([...a.payload.methods].sort(), methods);
  if (description) assert.equal(a.payload.description, description);
  traces.push(a);
  return a;
}
function clarify(r) {
  assert.equal(r.status, "NEEDS_INPUT");
  assert.equal(pending(r).length, 0);
}
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + "/api/dashboard")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const initial = ledger();
  const tests = [
    [
      "additive",
      async (s) =>
        preview(
          await s("ลิ้งรับเงิน 9000+3000+233 ลูกค้า A ค่า gas"),
          1223300,
          "A",
          ["QR"],
          "ค่า gas",
        ),
    ],
    [
      "decimal addition",
      async (s) =>
        preview(
          await s(
            "Issue a payment link to customer Rin for printing: 19.75 + 67.25 + 0.01 baht",
          ),
          8701,
          "Rin",
          ["QR"],
        ),
    ],
    [
      "gas",
      async (s) =>
        preview(
          await s("ลิ้งรับเงิน 1000 ลูกค้า A ค่า gas"),
          100000,
          "A",
          ["QR"],
          "ค่า gas",
        ),
    ],
    [
      "Thai baht and satang",
      async (s) =>
        preview(
          await s("สร้างลิงก์ เก้าร้อยบาทห้าสิบสตางค์ ค่าพิมพ์ จากคุณบัว"),
          90050,
          "บัว",
          ["QR"],
        ),
    ],
    [
      "card only",
      async (s) =>
        preview(
          await s("สร้างลิงก์ 650 บาท ค่าพิมพ์ จากคุณบัว ใช้บัตรเท่านั้น ห้ามใช้ QR"),
          65000,
          "บัว",
          ["CARD"],
        ),
    ],
    [
      "negative method paraphrase",
      async (s) =>
        preview(
          await s("ออกลิงก์ค่าพิมพ์ให้ลูกค้าชื่อแพร 725 บาท ใช้บัตรเท่านั้น ไม่รับชำระผ่าน QR"),
          72500,
          "แพร",
          ["CARD"],
        ),
    ],
    [
      "corrected deposit",
      async (s) => {
        const r = await s("ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000");
        clarify(r);
        const a = preview(
          await s("รับเงินมัดจำจากลูกค้าชื่อวิชัย แต่เก็บมัดจำแค่ 500 บาท", r.id),
          50000,
          "วิชัย",
          ["QR"],
        );
        assert.equal(a.payload.expires, "2026-11-25T05:00:00.000Z");
      },
    ],
    [
      "revise existing preview, preserve future expiry",
      async (s) => {
        const original = await s("ลิ้งรับเงิน 12233 ลูกค้า A ค่า gas");
        const old = pending(original)[0];
        assert.equal(old.amountMinor, 1223300);
        const edited = await s("แก้ไขยอดเป็น 4500 บาท ลูกค้าชื่อบี", original.id);
        const current = preview(edited, 450000, "บี", ["QR"], "ค่า gas");
        assert.equal(current.payload.expires, old.payload.expires);
        assert.ok(
          Date.parse(old.payload.expires) > Date.parse("2026-11-25T03:00:00Z"),
        );
        assert.equal(
          (await api("decision", { actionId: old.id, approve: true })).status,
          "REJECTED",
        );
      },
    ],
    [
      "balance and draft-only",
      async (s) => {
        const r = await s("ดูยอดก่อน ถ้ายังไม่จ่ายช่วยเตรียมข้อความ แต่ยังไม่ส่ง");
        assert.equal(pending(r).length, 0);
        assert.equal(r.status, "NEEDS_INPUT");
        assert.ok(r.actions.some((a) => a.kind === "get_dashboard_metrics"));
      },
    ],
    [
      "corrected confirmation",
      async (s) => {
        const r = await s("ลิ้ง ค่าบัตร 6000 เอ จ่าย");
        clarify(r);
        const corrected = await s("ไม่ใช่ ให้บีจ่าย 4500 บาท", r.id);
        clarify(corrected);
        assert.equal(corrected.nextAction, "CONFIRM_DETAILS");
        assert.match(corrected.summary, /4,500.*บี/);
        assert.doesNotMatch(corrected.summary, /6,000|ชื่อเอ/);
        preview(await s("ใช่ ตามนี้", r.id), 450000, "บี", ["QR"]);
      },
    ],
    [
      "buyer follow-up",
      async (s) => {
        const r = await s("ต้องการซื้อรถ ภายใน 2 ชม ราคา 5000");
        clarify(r);
        const buyer = await s("ซื้อเอง", r.id);
        assert.equal(pending(buyer).length, 0);
        assert.equal(buyer.status, "COMPLETE");
      },
    ],
    [
      "explicit merchant",
      async (s) =>
        preview(
          await s("ผมเป็นร้านค้า ต้องการรับเงินมัดจำจากลูกค้าชื่อวิชัย 500 บาท สำหรับซื้อบ้าน"),
          50000,
          "วิชัย",
          ["QR"],
        ),
    ],
    [
      "instructions only",
      async (s) => {
        const r = await s(
          "ถ้าร้านจะเก็บค่าห่อของ 95 บาทผ่านลิงก์ ต้องทำยังไงบ้าง ขอรู้ขั้นตอนเฉย ๆ",
        );
        assert.equal(r.status, "COMPLETE");
        assert.equal(pending(r).length, 0);
      },
    ],
    [
      "unsure price",
      async (s) =>
        clarify(
          await s("ช่วยออกลิงก์ค่าขนมให้หน่อย 420 หรือ 480 บาทนี่แหละ จำยอดสุทธิไม่ได้"),
        ),
    ],
    [
      "excess currency precision",
      async (s) => {
        const r = await s(
          "Issue an invoice to Rin for printing. Use THB 0.005 exactly.",
        );
        assert.equal(pending(r).length, 0);
        assert.match(
          r.summary,
          /THB|decimal|satang|precision|amount|สตางค์|ทศนิยม/i,
        );
      },
    ],
    [
      "English unseen",
      async (s) =>
        preview(
          await s(
            "Invoice customer Noor for a custom album, THB 81.09. Card payments only, please leave PromptPay off.",
          ),
          8109,
          "Noor",
          ["CARD"],
        ),
    ],
    [
      "recipient mismatch",
      async (s) => {
        const r = await s("ช่วยเตรียมข้อความทวงลูกค้าชื่อวิชัย ยังไม่ส่ง");
        assert.equal(pending(r).length, 0);
        assert.doesNotMatch(r.summary, /นภัส|4,700|สวัสดีค่ะ/);
        assert.match(r.summary, /ไม่พบ|ไม่มี/);
        assert.ok(r.actions.some((a) => a.kind === "list_unpaid_payments"));
      },
    ],
    [
      "collection",
      async (s) => {
        const r = await s(
          "ตรวจสอบยอดค้างชำระทั้งหมด วิเคราะห์ปัญหา และช่วยจัดการให้หน่อย",
        );
        const p = pending(r);
        assert.equal(
          p.filter((a) => a.kind === "regenerate_payment_link").length,
          2,
        );
        assert.equal(p.filter((a) => a.kind === "save_notification").length, 2);
        for (const a of p)
          assert.equal(
            db
              .prepare('SELECT status FROM "Order" WHERE id=?')
              .get(a.payload.orderId).status,
            "OPEN",
          );
      },
    ],
  ];
  const selected = process.env.LIVE_CASES
    ? tests.filter(([name]) => process.env.LIVE_CASES.split(",").includes(name))
    : tests;
  for (let i = 0; i < selected.length; i += 3)
    await Promise.all(selected.slice(i, i + 3).map(([n, f]) => scenario(n, f)));
  assert.deepEqual(ledger(), initial);
  const receipts = [];
  for (const a of traces) {
    const decision = await api("decision", { actionId: a.id, approve: true });
    assert.equal(decision.status, "EXECUTED");
    const link = await api("link?id=" + decision.result.id);
    assert.deepEqual(
      [link.order.amount, link.order.customer, link.methods.split(",").sort()],
      [a.amountMinor, a.payload.customer, [...a.payload.methods].sort()],
    );
    assert.equal(
      (await api("decision", { actionId: a.id, approve: true })).checkoutUrl,
      decision.checkoutUrl,
    );
    receipts.push({
      action: a.id,
      checkout: decision.checkoutUrl,
      amount: link.order.amount,
      customer: link.order.customer,
      methods: link.methods,
    });
  }
  const resumed = "historical-conflict-" + Date.now();
  db.prepare(
    "INSERT INTO AgentRun (id,merchant,prompt,mode,summary,createdAt,responseStatus,deadlineAt) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    resumed,
    "studio-bangkok",
    "ลิ้งรับเงิน 9000+3000+233 ลูกค้า A ค่า gas",
    "Native provider",
    "NEED_INPUT ยอดขัดกัน: รวม 12,233 บาท แต่ข้อมูลเดิม 9,000 บาท ต้องการใช้ยอดใดสำหรับลูกค้า A ค่า gas?",
    Date.parse("2026-11-25T02:30:00Z"),
    "NEEDS_INPUT",
    Date.parse("2026-11-25T02:31:00Z"),
  );
  app.kill();
  await exit;
  app = startApp();
  exit = once(app, "exit");
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/dashboard")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await scenario("restart, browser conflict resolution", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await page.goto(base + "/assistant?run=" + resumed);
      await page.reload();
      await page.locator(".summary").filter({ hasText: "ยอดขัดกัน" }).waitFor();
      const before = ledger();
      const field = page.locator("#prompt");
      await field.fill("12,233");
      const wait = page.waitForResponse((r) => r.url().endsWith("/api/agent"), {
        timeout: 70000,
      });
      await field.press("Enter");
      const run = await (await wait).json();
      assert.equal(run.id, resumed);
      assert.equal(run.mode, "Native provider");
      const a = preview(run, 1223300, "A", ["QR"], "ค่า gas");
      assert.deepEqual(ledger(), before);
      await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
      const anchor = page.getByRole("link", { name: /Open verified checkout/ });
      await anchor.waitFor();
      const stored = await api("decision", { actionId: a.id, approve: true });
      assert.equal(await anchor.getAttribute("href"), stored.checkoutUrl);
      const link = await api("link?id=" + stored.result.id);
      assert.equal(link.order.amount, 1223300);
      assert.deepEqual(ledger(), [
        before[0] + 1,
        before[1] + 1,
        ...before.slice(2),
      ]);
      receipts.push({
        run: run.id,
        action: a.id,
        checkout: stored.checkoutUrl,
        amount: link.order.amount,
        customer: link.order.customer,
        methods: link.methods,
        providerTurns: run.providerTurns,
        providerCalls: run.providerCalls,
      });
    } finally {
      await browser.close();
    }
  });
  await scenario("Chrome corrected payer, amount and consent", async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(base + "/assistant");
      const original = ledger();
      const submit = async (value) => {
        const field = page.locator("#prompt");
        await field.fill(value);
        const response = page.waitForResponse(
          (r) => r.url().endsWith("/api/agent"),
          { timeout: 70000 },
        );
        await field.press("Enter");
        return (await response).json();
      };
      const first = await submit("ลิ้ง ค่าบัตร 6000 เอ จ่าย");
      clarify(first);
      await page.getByRole("button", { name: "แก้ไขรายละเอียด" }).click();
      const second = await submit("ไม่ใช่ ให้บีจ่าย 4500 บาท");
      assert.equal(second.id, first.id);
      assert.match(second.summary, /4,500.*บี/);
      assert.doesNotMatch(second.summary, /6,000|ชื่อเอ/);
      await page.reload();
      const accepted = page.waitForResponse(
        (r) => r.url().endsWith("/api/agent"),
        { timeout: 70000 },
      );
      await page.getByRole("button", { name: "ใช่ ตามนี้" }).click();
      const run = await (await accepted).json();
      assert.equal(run.id, first.id);
      const a = preview(run, 450000, "บี", ["QR"]);
      assert.deepEqual(ledger(), original);
      await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
      const link = page.getByRole("link", { name: /Open verified checkout/ });
      await link.waitFor();
      const verified = await api("decision", { actionId: a.id, approve: true });
      assert.equal(await link.getAttribute("href"), verified.checkoutUrl);
      const stored = await api("link?id=" + verified.result.id);
      assert.deepEqual(
        [stored.order.amount, stored.order.customer, stored.methods],
        [450000, "บี", "QR"],
      );
      assert.deepEqual(ledger(), [
        original[0] + 1,
        original[1] + 1,
        ...original.slice(2),
      ]);
      receipts.push({
        run: run.id,
        action: a.id,
        checkout: verified.checkoutUrl,
        amount: stored.order.amount,
        customer: stored.order.customer,
        methods: stored.methods,
      });
    } finally {
      await browser.close();
    }
  });
  const protocol = readFileSync(env.QA_PROTOCOL_TRACE, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  for (const exchange of protocol) {
    const calls = new Set(
      exchange.flatMap((m) => (m.calls || []).map((c) => c.id)),
    );
    assert.ok(exchange.every((m) => !m.replyTo || calls.has(m.replyTo)));
  }
  const multiTurnRoles = protocol.filter(
    (ms) => ms.filter((m) => m.role === "user").length > 1,
  );
  assert.ok(multiTurnRoles.length > 0);
  const result = {
    model: process.env.OPENAI_MODEL,
    mode: "Native provider",
    multiTurnExample: multiTurnRoles.at(-1),
    initial,
    beforeApproval: initial,
    afterApproval: ledger(),
    cases,
    receipts,
  };
  if (process.env.LIVE_REPORT)
    writeFileSync(
      process.env.LIVE_REPORT,
      JSON.stringify(result, null, 2) + "\n",
    );
  console.log(
    "Acceptance",
    cases.filter((c) => c.pass).length + "/" + cases.length,
    "verified receipts",
    receipts.length,
  );
  if (cases.some((c) => !c.pass)) process.exitCode = 1;
} finally {
  db.close();
  app.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
