# Merchant conversations and public checkout verification

Tests used the production HTTP entry points, Chrome and disposable SQLite files. The language corpus ran at **25 November 2026, 10:00 Bangkok**. The approval and checkout walkthrough used a separate seeded database. All quoted amounts in the preview column are integer satang.

## Observed behavior

| Request | Before remediation | Verified outcome |
|---|---|---|
| House price 5000, then a 500-baht deposit from วิชัย | Preview kept 500000 and included the correction in the name | Preview showed วิชัย and 50000. Refusing QR retired that action. Approving its ID returned REJECTED. Choosing card produced a new action. Link readback contained วิชัย, 50000 and CARD. The original two-hour deadline stayed on the run. |
| 420 หรือ 480 บาท | Response asserted ยอด 480 | Asked for one final amount and produced zero proposals. |
| ลิ้งรับเงิน 1000 ลูกค้า A ค่า gas | Disposable baseline returned HTTP 201, NEEDS_INPUT, กรุณาระบุยอดเงิน, zero actions | One Enter showed **A · ฿1,000 · ค่า gas** in Chrome. HTTP preview contained QR and expiry exactly 24 hours after creation. Order and link counts stayed unchanged. One explicit approval created one order/link. SQLite returned A, 100000 and ค่า gas. Replaying approval returned the same URL. |
| ลิ้ง ค่าบัตร 6000 เอ จ่าย | On build FGwDWGZzL7_5RFDchil_B, Enter and the button each sent one POST, returned HTTP 201 COMPLETE and displayed the same generic capabilities reply. A separate owner observation saw a request to re-enter the amount. | The Thai question names 6,000 baht, asks if เอ is the payer, and explains the QR default. Confirmation in the same run only staged 600000 satang. Approval displayed the verified URL and copy control. |
| หนึ่งพันห้าร้อยบาท, and a longer composition with spaces (earlier offline build) | Independent review observed 500 baht for the first amount | For มาลี the preview contained 150000. สองหมื่นสามพัน สี่ร้อยยี่สิบเอ็ดบาท produced 2342100. A spoken fractional amount requested numeric clarification. |
| Draft a reminder for วิชัย without sending | Independent review saw an unrelated draft for นภัส, ฿4,700 | With zero matches the reply was ไม่พบออเดอร์ค้างชำระที่ตรงกับวิชัย. One match returned that order's amount. Two matches requested the order ID. Selecting the second returned 3,200 baht. All draft checks left notification count unchanged. |

The fixed-clock HTTP evaluation passed 22 original tuning turns, 9 original holdout turns, 15 reported regression turns and 15 additional turns, **61/61**. Every turn had a visible reply. The harness counted zero unrequested previews, incorrect preview amounts or changes to Order, Link, Attempt or Notification before approval. The unknown-recipient case invoked only list_unpaid_payments. The draft-with-balance case reads merchant totals and asks for the intended recipient. This replaces the previous oracle which accepted a draft for an unspecified customer.

The native protocol fixture rejected an incorrect amount, a changed recipient and a denied method before staging a proposal. For matching arguments it dispatched create_payment_link, returned the matching tool_call_id and received a second provider response. The server-side URL and model matched the owner's configuration. This initial review ran before the owner configured a server-side key. See the [subsequent live verification](native-agent.md).

## Browser and data checks

- Desktop and 390px Chrome exercised Enter, the submit button, same-run clarification, explicit approval, readback and completed state. Shift+Enter added a newline. Mobile showed the merchant's words, the Thai question, the focused reply field and confirmation controls. [Mobile conversation](assistant-confirmation-mobile.png)
- The smoke test interrupted one request before delivery and another after the server committed a preview. Both errors remained visible and retained the original text. Replaying the latter returned the same run and proposal IDs. Reusing its submission ID with different content returned HTTP 409.
- Both company-name cases retained **บริษัท แสงเช้า**, 500000 and both CARD and QR through approval and link lookup. A mixed-language preview retained June and ค่า mug ลายแมว. The English/Thai alternatives, instructions, buyer and hold cases appear under their own IDs in the corpus.
- A warmed browser run created the ฿5,000 link, approved through the UI, settled once, reloaded and saw ฿34,600 → ฿39,600 in 0.42 seconds of automated interaction. The same smoke suite checked two saved reminders, replacement checkout and replayed PENDING, FAILED and SUCCESS receipts.
- Direct load of the reported checkout originally returned 200 HTML showing ฿6,000 while Chrome received 404 for 1nci695__nz04.js. Navigation from Payment Links failed on both loopback hostnames. QA had rebuilt the mutable .next directory that the running process used. The owner tab's client build could not be inspected directly. The symptom was reproducible in a fresh browser on the same server.
- npm start now copies a finished build into a per-process temporary directory. A subsequent workspace build leaves the live server's manifests, server code and hashed assets intact. Restarting picks up the newly built release.
- At deployment the originally reported checkout was already PAID with one attempt. Direct load, reload and client navigation showed Paid in full at 1280px and 390px and correctly omitted the simulator and QR. On a separate existing open link, the same browser checks decoded the **rendered image** as PAYPILOT-SANDBOX followed by the link UUID. All ten checkout scripts returned JavaScript with HTTP 200. No page errors or failed requests occurred. The reported URL received read-only requests throughout verification.
- In the isolated seed, an open mixed-method checkout showed the QR and a card-only checkout omitted it. Paid and expired links displayed their closed state. An unknown ID showed the Thai missing-link screen. [Mobile checkout and QR](sandbox-qr-mobile.png)

## Reproduction

From a prepared checkout with local dependencies and Prisma client generated:

```sh
npm run typecheck
npm test
npm run build
EVAL_REPORT=/tmp/paypilot-turn-report.json node scripts/language-eval.mjs
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run smoke
```

The smoke and language commands allocate fresh databases. To capture the mobile states, set ASSISTANT_SCREENSHOT and CHECKOUT_SCREENSHOT to output PNG paths before running the smoke command. To verify an existing paid or active QR link on the first Payment Links page without submitting a checkout, run:

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  npx tsx scripts/checkout-browser.ts http://localhost:3000 e9d82a8a-a4c1-45bf-b7c6-25d7dfabc795 /tmp/paypilot-checkout.png
```

An authorized local key enables the same isolated corpus via `node scripts/language-eval.mjs --live`. Later native results and rehearsal timing appear in the [integrated verification](native-agent.md). Historical proof of a pre-implementation paper review remains unavailable. The earlier review records each of its seven findings and associated regression. [Prior independent findings](assistant-review.md)
