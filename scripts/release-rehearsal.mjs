// End-to-end local rehearsal. macOS Kanya voice sets the pace of each browser step.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const dir = mkdtempSync(join(tmpdir(), "paypilot-rehearsal-"));
const port = process.env.REHEARSAL_PORT || "3499",
  base = "http://127.0.0.1:" + port;
const env = { ...process.env, DATABASE_URL: "file:" + join(dir, "qa.db") };
assert.ok(
  env.OPENAI_API_KEY?.trim(),
  "Configure the local provider for this native rehearsal",
);
const lines = [
  "นี่คือหน้าร้านสตูดิโอ กรุงเทพ วันนี้ฉันจะตรวจยอดรับเงินและจัดการรายการค้าง จากข้อมูลจำลอง ตอนเริ่มต้นร้านได้รับเงินแล้วสามหมื่นสี่พันหกร้อยบาท และมียอดค้างอยู่แปดรายการ",
  "ฉันจะให้ผู้ช่วยเตรียมลิงก์รับเงินค่าทำเว็บไซต์ ห้าพันบาท สำหรับลูกค้าสมชาย ที่สังเกตได้คือผู้ช่วยแสดงชื่อลูกค้า ยอดเงิน และวิธีจ่ายให้ตรวจ โดยยังไม่มีลิงก์ที่ลูกค้าเปิดได้จนกว่าร้านจะอนุมัติ",
  "ฉันตรวจรายละเอียดและกดอนุมัติ ตอนนี้เห็นลิงก์ที่อ่านกลับจากฐานข้อมูล ฉันเปิดหน้าชำระเงินจำลอง เลือกผลสำเร็จ แล้วตรวจยอดรายรับอีกครั้ง ยอดขึ้นเป็นสามหมื่นเก้าพันหกร้อยบาท การเปิดหน้าเดิมซ้ำจะไม่เพิ่มยอดอีก",
  "ต่อไปฉันให้ผู้ช่วยตรวจยอดค้างของร้าน ผู้ช่วยดูข้อมูลออเดอร์ ลิงก์ปัจจุบัน และประวัติการจ่าย เพื่อแยกว่าออเดอร์ใดควรรอ ออเดอร์ใดลิงก์หมดอายุ และออเดอร์ใดถึงเวลาติดตาม",
  "ฉันตรวจข้อเสนอแล้วกดอนุมัติทั้งชุด ลิงก์ใหม่เปิดได้ และข้อความเตือนสองรายการถูกบันทึกไว้ในระบบจำลอง ทุกขั้นตอนมีประวัติให้ตรวจกลับ ไม่มีการส่งข้อความจริงหรือเรียกเก็บเงินจริง",
];
const audioSeconds = lines.map((line, i) => {
  const path = join(dir, i + ".aiff");
  execFileSync("say", ["-v", "Kanya", "-r", "165", "-o", path, line]);
  return Number(
    /estimated duration:\s*([\d.]+)/i.exec(
      execFileSync("afinfo", [path], { encoding: "utf8" }),
    )[1],
  );
});
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
execFileSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env });
const app = spawn(
  process.execPath,
  ["scripts/start.mjs", "-H", "127.0.0.1", "-p", port],
  { env, stdio: "ignore" },
);
const exit = once(app, "exit");
let browser, client;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/dashboard")).ok) break;
    } catch {}
    await wait(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage();
  page.setDefaultTimeout(75000);
  const stage = async (i, work) => {
    await Promise.all([wait(Math.ceil(1000 * audioSeconds[i])), work()]);
  };
  const start = performance.now();
  const dashboard = async () =>
    await (await page.request.get(base + "/api/dashboard")).json();
  await stage(0, async () => {
    await page.goto(base);
    assert.equal((await dashboard()).revenue, 3460000);
  });
  await stage(1, async () => {
    await page.goto(base + "/assistant");
    const field = page.locator("#prompt");
    await field.fill("สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้");
    await field.press("Enter");
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).waitFor();
  });
  await stage(2, async () => {
    await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
    await page.getByRole("link", { name: /Open verified checkout/ }).click();
    await page.getByRole("button", { name: "Simulate checkout" }).click();
    await page.getByText("Paid in full").waitFor();
    await page.reload();
    await page.getByText("Paid in full").waitFor();
    await page.goto(base);
    assert.equal((await dashboard()).revenue, 3960000);
  });
  await stage(3, async () => {
    await page.getByRole("link", { name: "Review collections" }).click();
    await page
      .getByRole("button", { name: "Review outstanding payments" })
      .click();
    await page.getByText("4 awaiting approval · 0 executed").waitFor();
  });
  await stage(4, async () => {
    await page.getByRole("button", { name: "Approve all eligible" }).click();
    await page.getByText("0 awaiting approval · 4 executed").waitFor();
    assert.equal(await page.getByText(/Verified saved reminder/).count(), 2);
    await page
      .getByRole("link", { name: /Open verified checkout/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Simulate checkout" }).waitFor();
  });
  console.log(
    JSON.stringify({
      mode: "Native provider",
      voice: "Kanya",
      speechSeconds: audioSeconds,
      elapsedSeconds: Math.round((performance.now() - start) / 1000),
      revenueDelta: 500000,
      reminders: 2,
    }),
  );
  // Exercise the merged external adapter without exposing provider configuration to its process.
  client = new Client({ name: "paypilot-release-qa", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve("node_modules/tsx/dist/cli.mjs"),
        resolve("scripts/mcp.ts"),
      ],
      env: { PATH: process.env.PATH, PAYPILOT_ORIGIN: base },
    }),
  );
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "propose_payment_link",
    "read_action",
    "read_outstanding",
  ]);
  const call = async (name, args) => {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError);
    return JSON.parse(r.content[0].text);
  };
  const totals = await call("read_outstanding", {});
  assert.equal(totals.amountMinor, (await dashboard()).pending);
  const proposal = await call("propose_payment_link", {
    amount: 101,
    customer: "QA",
    description: "MCP",
    methods: ["QR"],
  });
  assert.equal(proposal.status, "PROPOSED");
  assert.equal(proposal.checkoutUrl, null);
  await page.goto(proposal.reviewUrl);
  await page.getByRole("button", { name: "อนุมัติและสร้างลิงก์" }).click();
  const anchor = page.getByRole("link", { name: /Open verified checkout/ });
  await anchor.waitFor();
  const verified = await call("read_action", { actionId: proposal.actionId });
  assert.equal(verified.status, "EXECUTED");
  assert.equal(
    verified.checkoutUrl,
    new URL(await anchor.getAttribute("href"), base).href,
  );
  console.log(
    JSON.stringify({
      mcp: names,
      actionId: verified.actionId,
      checkoutUrl: verified.checkoutUrl,
    }),
  );
} finally {
  await client?.close();
  await browser?.close();
  app.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
