import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import nextEnv from "@next/env";
import {
  tuning,
  holdout,
  corrections,
  variants,
} from "../tests/language/corpus.mjs";
nextEnv.loadEnvConfig(process.cwd());
const live = process.argv.includes("--live");
if (live && !process.env.OPENAI_API_KEY?.trim())
  throw Error("Set the authorized local provider key for a live run");
const dir = mkdtempSync(join(tmpdir(), "paypilot-language-"));
const file = join(dir, "qa.db"),
  port = Number(process.env.EVAL_PORT ?? 3486),
  base = "http://127.0.0.1:" + port;
const env = {
  ...process.env,
  DATABASE_URL: "file:" + file,
  OPENAI_API_KEY: live ? process.env.OPENAI_API_KEY : "",
  TZ: "Asia/Bangkok",
  NODE_OPTIONS:
    "--require=" + JSON.stringify(resolve("tests/language/clock.cjs")),
};
execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"], { env });
execFileSync("node_modules/.bin/tsx", ["scripts/seed.ts"], { env });
const db = new DatabaseSync(file);
const count = (t) => db.prepare("SELECT count(*) AS n FROM " + t).get().n;
const ledger = () => ['"Order"', "Link", "Attempt", "Notification"].map(count);
const app = spawn(
  process.execPath,
  ["scripts/start.mjs", "-H", "127.0.0.1", "-p", String(port)],
  { env, stdio: "ignore" },
);
const exit = once(app, "exit");
const report = {};
try {
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw Error("QA server startup failed");
    try {
      if ((await fetch(base + "/api/dashboard")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const [split, cases] of Object.entries({
    tuning,
    holdout,
    corrections,
    variants,
  })) {
    if (process.env.EVAL_SPLIT && split !== process.env.EVAL_SPLIT) continue;
    const rows = [];
    let last;
    for (const [id, prompt, expected] of cases) {
      const expect =
        !live && expected.demoClarifiesMoney
          ? { status: "NEEDS_INPUT", words: ["ตัวเลข|ยอดเงิน"] }
          : live && expected.nativeExpected
            ? expected.nativeExpected
            : expected;
      const before = ledger();
      const previous = expect.continue ? last : null;
      const res = await fetch(base + "/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          ...(previous ? { runId: previous.runId } : {}),
        }),
      });
      const run = await res.json(),
        reply = run.summary ?? run.error ?? "";
      const changes = ledger().map((n, i) => n - before[i]);
      const actions = run.actions ?? [];
      const pending = actions.filter((a) => a.status === "PROPOSED");
      const trace = actions
        .filter((a) => a.status === "EVENT")
        .map((a) => a.kind);
      const preview = pending.map((a) => ({
        amount: a.amountMinor,
        customer: a.payload.customer,
        expiry: a.payload.expires,
        methods: a.payload.methods,
        description: a.payload.description,
      }));
      const prior =
        previous?.actions?.filter((a) => a.status === "PROPOSED") ?? [];
      const retired =
        !expect.retire ||
        (prior.length > 0 &&
          prior.every(
            (a) =>
              db.prepare("SELECT status FROM AgentAction WHERE id=?").get(a.id)
                .status === "REJECTED",
          ));
      const amountOk =
        expect.amount === undefined
          ? pending.length === 0
          : pending.length === 1 && preview[0].amount === expect.amount;
      const contractPass =
        !!reply &&
        res.ok &&
        changes.every((n) => !n) &&
        amountOk &&
        retired &&
        (!expect.status || run.status === expect.status) &&
        (!expect.name || preview[0]?.customer === expect.name) &&
        (!expect.description ||
          preview[0]?.description === expect.description) &&
        (!expect.methods ||
          [...(preview[0]?.methods ?? [])].sort().join() ===
            [...expect.methods].sort().join()) &&
        (expect.absent ?? []).every((w) => !new RegExp(w, "i").test(reply)) &&
        (!expect.expiry || preview[0]?.expiry === expect.expiry) &&
        (!expect.tool || trace.includes(expect.tool)) &&
        (!expect.also || trace.includes(expect.also));
      const pass =
        contractPass &&
        (expect.words ?? []).every((w) => new RegExp(w, "i").test(reply));
      rows.push({
        id,
        pass,
        contractPass,
        http: res.status,
        status: run.status ?? "ERROR",
        reply: reply.slice(0, 320),
        preview,
        trace,
        changes,
        unrequested: expect.amount === undefined ? pending.length : 0,
        unsafeAmount: preview.filter((p) => p.amount !== expect.amount).length,
        retired,
      });
      last = run;
    }
    report[split] = rows;
    console.log(
      split,
      JSON.stringify({
        pass: rows.filter((r) => r.pass).length,
        contractPass: rows.filter((r) => r.contractPass).length,
        total: rows.length,
        noReply: rows.filter((r) => !r.reply).length,
        misrouted: rows.reduce((n, r) => n + r.unrequested, 0),
        unsafeAmounts: rows.reduce((n, r) => n + r.unsafeAmount, 0),
        businessWrites: rows.reduce(
          (n, r) => n + r.changes.reduce((a, b) => a + b, 0),
          0,
        ),
      }),
    );
  }
  if (process.env.EVAL_REPORT)
    writeFileSync(
      process.env.EVAL_REPORT,
      JSON.stringify(report, null, 2) + "\n",
    );
  if (
    Object.values(report)
      .flat()
      .some((r) => !r.pass)
  )
    process.exitCode = 1;
} finally {
  db.close();
  app.kill();
  await exit;
  rmSync(dir, { recursive: true, force: true });
}
