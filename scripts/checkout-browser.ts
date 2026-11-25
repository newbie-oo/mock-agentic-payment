import { chromium, type Page } from "@playwright/test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { pathToFileURL } from "node:url";

export async function decodeCheckout(page: Page, id: string) {
  const qr = page.getByRole("img", { name: "QR จำลองสำหรับเดโม" });
  await qr.waitFor();
  const rendered = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(
    new Uint8ClampedArray(rendered.data),
    rendered.width,
    rendered.height,
  );
  assert.equal(decoded?.data, "PAYPILOT-SANDBOX:" + id);
  await page
    .getByText("QR จำลองสำหรับเดโม ชำระเงินจริงไม่ได้", { exact: true })
    .waitFor();
  return decoded.data;
}
// This command only reads the given checkout. It never presses Simulate checkout.
async function verify(base: string, id: string, shot?: string) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
  });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => {
        if (r.status() >= 400)
          errors.push(r.status() + " " + new URL(r.url()).pathname);
      });
      const path = "/pay/" + id;
      const lookup = await page.request.get(base + "/api/link?id=" + id);
      assert.equal(lookup.status(), 200);
      const link = await lookup.json();
      async function visibleState() {
        if (link.order.status === "PAID") {
          await page.getByText("Paid in full", { exact: true }).waitFor();
          assert.equal(
            await page.locator(".sandbox-qr img, button[type=submit]").count(),
            0,
          );
          return "PAID";
        }
        return decodeCheckout(page, id);
      }
      await page.goto(base + path);
      await page.waitForLoadState("networkidle");
      await visibleState();
      const assets = await page
        .locator("script[src]")
        .evaluateAll((elements) =>
          elements.map((e) => (e as HTMLScriptElement).src),
        );
      for (const asset of assets) {
        const response = await page.request.get(asset);
        assert.equal(response.status(), 200);
        assert.match(response.headers()["content-type"], /javascript/);
      }
      await page.reload();
      await page.waitForLoadState("networkidle");
      await visibleState();
      await page.goto(base + "/links");
      await page.waitForLoadState("networkidle");
      await page
        .locator('a[href="' + path + '"]')
        .first()
        .click();
      await page.waitForURL(base + path);
      await page.waitForLoadState("networkidle");
      const payload = await visibleState();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      assert.equal(
        await page.getByRole("button", { name: "Simulate checkout" }).count(),
        link.order.status === "PAID" ? 0 : 1,
      );
      assert.deepEqual(errors, []);
      if (shot && width === 390)
        await page.screenshot({ path: shot, fullPage: true });
      console.log(
        JSON.stringify({
          base,
          width,
          scripts: assets.length,
          payload,
          errors,
        }),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const [, , base, id, shot] = process.argv;
  assert.ok(
    base && id,
    "Pass the local base URL and an active QR link from the first links page",
  );
  await verify(base, id, shot);
}
