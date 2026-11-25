// Independent HTTP conversations at fixed and actual server time.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
assert.ok(
  process.env.OPENAI_API_KEY?.trim(),
  "Configure the authorized local provider",
);
async function trials(fixed) {
  const dir = mkdtempSync(join(tmpdir(), "paypilot-revisions-")),
    path = join(dir, "qa.db");
  const port = Number(process.env.REVISION_PORT ?? 3570) + Number(fixed),
    base = "http://127.0.0.1:" + port + "/api/";
  const env = {
    ...process.env,
    DATABASE_URL: "file:" + path,
    ...(fixed
      ? {
          NODE_OPTIONS:
            "--require=" + JSON.stringify(resolve("tests/language/clock.cjs")),
        }
      : {}),
  };
  execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
  const app = spawn(
      process.execPath,
      ["scripts/start.mjs", "-p", String(port), "-H", "127.0.0.1"],
      { env, stdio: "ignore" },
    ),
    exit = once(app, "exit");
  const db = new DatabaseSync(path, { readOnly: true });
  const counts = () =>
    ['"Order"', "Link", "Attempt", "Notification"].map(
      (t) => db.prepare("SELECT count(*) AS n FROM " + t).get().n,
    );
  const post = async (op, body) =>
    (
      await fetch(base + op, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
  try {
    for (let i = 0; i < 120; i++) {
      try {
        if ((await fetch(base + "dashboard")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    for (let n = 0; n < 3; n++) {
      const before = counts();
      const first = await post("agent", {
        prompt: "ลิ้งรับเงิน 12233 ลูกค้า A ค่า gas",
      });
      const second = await post("agent", {
        prompt: "แก้ไขยอดเป็น 4500 บาท ลูกค้าชื่อบี",
        runId: first.id,
      });
      const guide = await post("agent", {
        prompt: "ถ้าร้านจะเก็บค่าห่อของ 95 บาทผ่านลิงก์ ต้องทำยังไงบ้าง ขอรู้ขั้นตอนเฉย ๆ",
      });
      const a = first.actions.find((a) => a.status === "PROPOSED"),
        b = second.actions?.find((a) => a.status === "PROPOSED");
      const sameExpiry = a?.payload.expires === b?.payload.expires;
      const checks = [
        first.status === "AWAITING_APPROVAL",
        a?.amountMinor === 1223300,
        first.mode === "Native provider",
        second.id === first.id,
        b?.amountMinor === 450000,
        b?.payload.customer === "บี",
        b?.payload.description === "ค่า gas",
        b?.payload.methods.join() === "QR",
        sameExpiry,
        second.actions?.some((x) => x.id === a?.id && x.status === "REJECTED"),
        guide.status === "COMPLETE",
        guide.actions.every((x) => x.status !== "PROPOSED"),
        JSON.stringify(before) === JSON.stringify(counts()),
      ];
      console.log(
        JSON.stringify({
          clock: fixed ? "fixed" : "real",
          trial: n + 1,
          run: first.id,
          statuses: [first.status, second.status, guide.status],
          expiry: b?.payload.expires,
          amount: b?.amountMinor,
          customer: b?.payload.customer,
          methods: b?.payload.methods,
          guide: guide.summary,
          old: a?.id,
          new: b?.id,
          before,
          after: counts(),
          pass: checks.every(Boolean),
        }),
      );
      if (!checks.every(Boolean)) process.exitCode = 1;
    }
  } finally {
    db.close();
    app.kill();
    await exit;
    rmSync(dir, { recursive: true, force: true });
  }
}
await Promise.all([trials(true), trials(false)]);
