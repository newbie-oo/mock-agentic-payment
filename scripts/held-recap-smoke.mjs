// Chrome uses the real Next HTTP routes and a disposable SQLite database.
// The provider fixture replays the intent payload from QA run cmwvjco00000dlhz9oiysdqck.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const fixed = {
  amount: 1223300,
  customer: "A",
  description: "ค่า gas",
  methods: ["QR"],
  currency: "THB",
  expires: new Date(Date.now() + 86400000).toISOString(),
};
const revised = { ...fixed, customer: "บี", amount: 450000 };
const opening = "ลิ้งรับเงิน 12233 ลูกค้า A ค่า gas",
  edit = "แก้ไขยอดเป็น 4500 บาท ลูกค้าชื่อบี ขอทวนข้อมูลก่อน ยังไม่ต้องเตรียมข้อเสนอ";
const heldIntent = {
  intent: "inform",
  deferPreview: true,
  message: "จะทวนข้อมูลที่แก้ไขให้ก่อน โดยยังไม่จัดเตรียมข้อเสนอ",
};
const appPort = process.env.HOLD_PORT || "3670",
  base = "http://127.0.0.1:" + appPort,
  dir = mkdtempSync(join(tmpdir(), "paypilot-hold-")),
  file = join(dir, "qa.db");
const live = process.argv.includes("--live"),
  offline = process.argv.includes("--offline");
if (live) assert.ok(process.env.OPENAI_API_KEY?.trim());
const fixture = createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const p = JSON.parse(body),
    name = p.tool_choice?.function?.name,
    latest = p.messages.filter((m) => m.role === "user").at(-1)?.content;
  const args =
    name === "interpret_merchant_request"
      ? latest === edit
        ? heldIntent
        : {
            intent: "create",
            terms: latest === opening ? fixed : revised,
            payerBinding: "identified",
            requestQuote: latest,
          }
      : name === "read_held_terms"
        ? revised
        : {};
  const message = name
    ? {
        content: null,
        tool_calls: [
          {
            type: "function",
            id: randomUUID(),
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      }
    : { content: "ตรวจรายละเอียดก่อนอนุมัติ" };
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify({ choices: [{ message }] }));
});
fixture.listen(0, "127.0.0.1");
await once(fixture, "listening");
const env = {
  ...process.env,
  DATABASE_URL: "file:" + file,
  ...(live
    ? {}
    : {
        OPENAI_API_KEY: offline ? "" : randomUUID(),
        OPENAI_BASE_URL: "http://127.0.0.1:" + fixture.address().port + "/v1",
      }),
};
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
const app = spawn(
    process.execPath,
    ["scripts/start.mjs", "-H", "127.0.0.1", "-p", String(appPort)],
    { env, stdio: "ignore" },
  ),
  exit = once(app, "exit");
let browser;
const db = new DatabaseSync(file);
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/dashboard")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const post = async (op, body) => {
    const r = await fetch(base + "/api/" + op, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const dto = await r.json();
    assert.ok(r.ok, dto.error);
    return dto;
  };
  const first = await post("agent", { prompt: opening }),
    old = first.actions.find((a) => a.status === "PROPOSED");
  assert.equal(old.amountMinor, 1223300);
  const held = await post("agent", { runId: first.id, prompt: edit });
  console.log(
    JSON.stringify({
      mode: held.mode,
      run: held.id,
      status: held.status,
      summary: held.summary,
    }),
  );
  assert.equal(held.status, "NEEDS_INPUT");
  assert.equal(held.nextAction, "PREPARE_PREVIEW");
  assert.equal(held.actions.filter((a) => a.status === "PROPOSED").length, 0);
  assert.equal(
    (await post("decision", { actionId: old.id, approve: true })).status,
    "REJECTED",
  );
  const counts = () =>
    ['"Order"', "Link", "Attempt", "Notification"].map(
      (t) => db.prepare("select count(*) as n from " + t).get().n,
    );
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + "/assistant?run=" + held.id);
  await page.reload();
  const recap = await page.locator(".summary").innerText();
  for (const fact of ["บี", "4,500", "ค่า gas", "QR", "กรุงเทพ"])
    assert.ok(recap.includes(fact), recap);
  assert.equal(
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).count(),
    0,
  );
  await page.getByLabel("ตอบกลับ").waitFor();
  assert.deepEqual(counts(), [0, 0, 0, 0]);
  const result = page.waitForResponse((r) => r.url().endsWith("/api/agent"), {
    timeout: 70000,
  });
  await page.getByRole("button", { name: "เตรียมข้อเสนอจากข้อมูลนี้" }).click();
  const preview = await (await result).json();
  assert.equal(preview.id, held.id);
  assert.equal(preview.status, "AWAITING_APPROVAL");
  const action = preview.actions.find((a) => a.status === "PROPOSED");
  assert.deepEqual(
    [
      action.payload.amount,
      action.payload.customer,
      action.payload.description,
      action.payload.methods,
      action.payload.expires,
    ],
    [450000, "บี", "ค่า gas", ["QR"], old.payload.expires],
  );
  assert.deepEqual(counts(), [0, 0, 0, 0]);
  await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
  const link = page.getByRole("link", { name: /Open verified checkout/ });
  await link.waitFor();
  const url = await link.getAttribute("href");
  assert.equal(
    (await post("decision", { actionId: action.id, approve: true }))
      .checkoutUrl,
    url,
  );
  assert.deepEqual(counts(), [1, 1, 0, 0]);
  console.log(
    JSON.stringify({
      action: action.id,
      url,
      amount: action.amountMinor,
      counts: counts(),
    }),
  );
} finally {
  await browser?.close();
  app.kill();
  await exit;
  await new Promise((r) => fixture.close(r));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
