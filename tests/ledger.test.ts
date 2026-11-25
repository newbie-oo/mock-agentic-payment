import { dir } from "./database";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { rmSync } from "node:fs";
import { db, merchant } from "../lib/db";
import { metrics, checkout } from "../lib/service";
const instant = Date.parse("2026-11-25T03:00:00Z");
async function fixture() {
  for (const [i, [scope, amount, status]] of (
    [
      [merchant, 500000, "PAID"],
      [merchant, 125050, "OPEN"],
      [merchant, 1, "OPEN"],
      ["B", 7700, "PAID"],
    ] as const
  ).entries()) {
    const id = "o" + i;
    await db.order.create({
      data: {
        id,
        merchant: scope,
        customer: "Same display name",
        description: "QA fixture",
        amount,
        status,
      },
    });
    if (i === 0)
      await db.link.create({
        data: {
          id: "old",
          orderId: id,
          methods: "CARD",
          expires: new Date(instant - 1),
        },
      });
    const link = await db.link.create({
      data: {
        id: "l" + i,
        orderId: id,
        methods: "QR",
        activeSlot: id,
        expires: new Date(i === 2 ? instant : instant + 86400000),
      },
    });
    const entries =
      status === "PAID"
        ? i === 0
          ? ["FAILED", "SUCCESS"]
          : ["SUCCESS"]
        : i === 1
          ? ["PENDING"]
          : [];
    for (const outcome of entries)
      await db.attempt.create({
        data: {
          orderId: id,
          linkId: outcome === "FAILED" ? "old" : link.id,
          merchant: scope,
          method: outcome === "FAILED" ? "CARD" : "QR",
          status: outcome,
          requestId: crypto.randomUUID(),
          settlement: outcome === "SUCCESS" ? id : null,
        },
      });
  }
}
before(() => execFileSync("node_modules/.bin/prisma", ["migrate", "deploy"]));
after(async () => {
  await db.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
test("two-merchant fixture reset twice with exact balances and expiry millisecond boundaries", async (t) => {
  for (let i = 0; i < 2; i++) {
    await db.attempt.deleteMany();
    await db.link.deleteMany();
    await db.order.deleteMany();
    await fixture();
    assert.deepEqual(
      await Promise.all([
        db.order.count(),
        db.link.count(),
        db.attempt.count(),
        db.attempt.count({ where: { settlement: { not: null } } }),
      ]),
      [4, 5, 4, 2],
    );
    const [a, b] = await Promise.all([metrics(), metrics("B")]);
    assert.deepEqual(
      [a.revenue, a.pending, b.revenue, b.pending],
      [500000, 125051, 7700, 0],
    );
  }
  for (const offset of [-1, 0, 1]) {
    const mock = t.mock.method(Date, "now", () => instant + offset);
    const op = checkout({
      linkId: "l2",
      status: "PENDING",
      method: "QR",
      requestId: crypto.randomUUID(),
    });
    if (offset < 0) assert.equal((await op).status, "PENDING");
    else await assert.rejects(op, /closed/);
    mock.mock.restore();
  }
});
test("two independent processes race checkout on the same SQLite file", async () => {
  await db.link.update({
    where: { id: "l1" },
    data: { expires: new Date(Date.now() + 86400000) },
  });
  const run = promisify(execFile);
  const code =
    "import {checkout} from './lib/service'; checkout({linkId:'l1',method:'QR',status:'SUCCESS',requestId:crypto.randomUUID()}).then(()=>console.log('settled')).catch(()=>console.log('blocked'))";
  const results = await Promise.all([
    run("node_modules/.bin/tsx", ["-e", code]),
    run("node_modules/.bin/tsx", ["-e", code]),
  ]);
  assert.deepEqual(results.map((x) => x.stdout.trim()).sort(), [
    "blocked",
    "settled",
  ]);
  assert.equal(await db.attempt.count({ where: { settlement: "o1" } }), 1);
});
