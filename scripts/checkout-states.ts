import type { Page } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { decodeCheckout } from "./checkout-browser";

export async function checkoutStates(page: Page, base: string, file: string) {
  const db = new DatabaseSync(file);
  try {
    const seed = db
      .prepare(
        'SELECT l.id,l.methods,l.expires,o.status FROM Link l JOIN "Order" o ON o.id=l.orderId WHERE l.activeSlot IS NOT NULL',
      )
      .all();
    const now = Date.now();
    const open = seed.find(
      (l) =>
        l.status === "OPEN" &&
        Number(l.expires) > now &&
        String(l.methods).includes("QR") &&
        String(l.methods).includes("CARD"),
    );
    const paid = seed.find((l) => l.status === "PAID");
    const expired = seed.find(
      (l) => l.status === "OPEN" && Number(l.expires) <= now,
    );
    assert.ok(open && paid && expired);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/pay/" + open.id);
    await page.waitForLoadState("networkidle");
    assert.equal(
      await decodeCheckout(page, String(open.id)),
      "PAYPILOT-SANDBOX:" + open.id,
    );
    if (process.env.CHECKOUT_SCREENSHOT)
      await page.screenshot({
        path: process.env.CHECKOUT_SCREENSHOT,
        fullPage: true,
      });
    for (const [id, label] of [
      [paid.id, "Paid in full"],
      [expired.id, "Link expired"],
      ["unknown-checkout", "ไม่พบลิงก์ชำระเงินนี้"],
    ]) {
      await page.goto(base + "/pay/" + id);
      await page.getByRole("heading", { name: String(label) }).waitFor();
      assert.equal(await page.locator(".sandbox-qr").count(), 0);
    }
    const card = seed.find(
      (l) =>
        l.status === "OPEN" && Number(l.expires) > now && l.methods === "CARD",
    );
    assert.ok(card);
    await page.goto(base + "/pay/" + card.id);
    await page.getByRole("button", { name: "Simulate checkout" }).waitFor();
    assert.equal(await page.locator(".sandbox-qr").count(), 0);
    console.log(
      "Checkout states passed; mixed QR payload PAYPILOT-SANDBOX:" + open.id,
    );
  } finally {
    db.close();
  }
}
