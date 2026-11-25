# Assistant and payment review

## Reproduction

On an isolated seeded production build of ea79438, pressing Enter after **ต้องการซื้อบ้าน ภายใน 2 ชม ราคา 5000** appended a newline and made zero POST requests. Clicking Run assistant made one POST, and the response appeared below the composer. Direct POST returned 201, Deterministic demo, NEEDS_INPUT and zero actions. Both paths returned the same generic example asking for an amount, customer and description. The parser required a currency-marked amount and recognized ชั่วโมง but missed ชม. The reproduction distinguishes keyboard behavior from the response on submission. The owner's exact sequence was unobserved.

Enter now submits, Shift+Enter inserts a newline, and IME composition retains keyboard control. The returned response heading takes focus. On this prompt the server asks about buying versus collecting a deposit/payment, repeats 5000 and two hours, and requests the customer name. A name alone leaves intent unresolved. A confirmed collection reply creates a preview in the original run with the deadline anchored to its start. Approval is still required. The shared purchase check runs before tools in either mode and records that fact in the timeline.

## Evaluation method

The baseline system prompt and parser are in Git object f2f3097746d36c5b9254e558ddc856f8fb7c04b2 at ea79438:lib/agent.ts. The original production bundle was still running when the corpus was written. The two splits and scoring rules were declared before the baseline run. Tuning used the 22 development turns; the nine holdout turns were scored separately. Tests used HTTP POST against a new SQLite file and Bangkok time frozen at 25 November 2026, 10:00. The server received the prior run ID for follow-ups. The harness checked status, selected semantic terms, IDs of retired previews, expected amount/name/expiry where specified, tool events, and counts in Order, Link, Attempt and Notification after each turn.

| Mode and split | Baseline passed | Current passed | Empty replies before / after | Unrequested previews before / after | Unexpected amounts before / after | Business writes before / after |
|---|---:|---:|---:|---:|---:|---:|
| Deterministic, tuning | 6/22 | 22/22 | 0/0 | 0/0 | 0/0 | 0/0 |
| Deterministic, holdout | 2/9 | 9/9 | 0/0 | 0/0 | 0/0 | 0/0 |

These counts concern submitted HTTP requests. The original Enter failure had no HTTP response to count. The earlier revision and cancellation requests returned 409 and left the prior preview actionable; the new behavior retires that proposal. The native system prompt was revised separately using the observed intent failures. Native fixtures exercised actual dispatch, readback, clarification, cumulative limits, failure recovery and a prohibited write on a read-only request. Fixture replies were scripted. Neither live-model language accuracy nor improvement from prompt tuning has been measured. The configured model and base URL matched gpt-5.6-terra and http://127.0.0.1:8317/v1. The worker environment and project environment had no configured provider key.

## Independent review findings

| Finding | Change and verification |
|---|---|
| 1. Lost checkout response | The browser retains the same UUID and frozen payload through retry and tab reload. After an acknowledged result, the next submission starts a new attempt. An explicit new-attempt control is available after errors. Browser smoke intercepted PENDING, FAILED and SUCCESS after server commit, dropped the response, retried and checked the same request ID and a single recorded attempt per outcome. PENDING also reloaded the page before retry. |
| 2. Trend units | Dashboard trend.total now uses integer satang, matching revenue and order amounts. The chart axis, tooltip and accessible description format satang as baht. The browser verified the ฿5,000 chart label and an HTTP trend delta of 500000. |
| 3. Names, methods, language | Two Thai phrases went through actual HTTP create, approve and link lookup. Each returned บริษัท แสงเช้า, 500000 satang, CARD and QR. Corpus includes an English create and Bangkok-day revenue read. |
| 4. Status and cumulative provider limits | A migration adds persisted response state, calls, turns and deadline. Each provider batch reserves budget before dispatch. A follow-up requesting 13 calls after 20 hits the 32-call limit. An all-error completion fails. A corrected call followed by verified data succeeds. Existing native runs retain their original time window. |
| 5. Collection evidence | Each recovery snapshot includes order ID, description, reason, expiry and the latest attempt ID, outcome, method and activity time when present. Reminder eligibility starts at 24 hours since the latest attempt, or order creation when there are no attempts. Approval rechecks for changed payment activity. The summary groups by display name and labels its count as distinct names. Two orders with the same name remain separate. A keyset continuation retrieves subsequent batches after 60 orders. Tests checked fresh activity on an older order, the exact 24-hour boundary and a 61-order run. UI includes bulk rejection. |
| 6. Mobile | Browser smoke opens Overview, Transactions, Payment Links and AI Assistant at 390px before navigation. A separate desktop-to-mobile resize waits for the chart layout to settle within five seconds. The chart container bounds the redraw. |
| 7. Manual form and expiry | The form publishes the SQLite integer maximum as 21,474,836.47 THB. Conversion runs inside the same error handler as submission. The browser checked rangeOverflow for 21,474,836.48. Both UI statuses and checkout submission use the same inclusive expiry predicate. Existing integration tests exercise T−1ms, T and T+1ms. |
| Query and maintenance observations | Compact history requests five rows. Paginated pages request one extra row to determine whether Next exists. Method lookup projects only methods. Bulk decisions initially load only action IDs. Full run inspection intentionally returns the requested timeline and proposals together. Clipboard interaction was exercised in Chromium. |
| Earlier history and remaining limits | Commit chronology and the timing of early design review are recorded in PLAN.md. No human interview was timed. The deterministic adapter supports the evaluated language patterns and asks for clarification outside its supported inputs. |

## Reproduce

```sh
npm ci
npx prisma generate
npm run typecheck
npm test
npm run build
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run smoke
EVAL_REPORT=/tmp/paypilot-demo-eval.json node scripts/language-eval.mjs
```

For a live evaluation, configure the authorized server-side provider key locally and run the same corpus with the following command. The harness creates a temporary QA database. It exits early if no provider key is configured.

```sh
EVAL_REPORT=/tmp/paypilot-live-eval.json node scripts/language-eval.mjs --live
```

For baseline reproduction use a separate checkout at ea79438. Copy scripts/language-eval.mjs and tests/language from the fix into that checkout, install and build it, then invoke the same deterministic command. The baseline exits nonzero on the recorded mismatches.

## Per-turn observations

Replies below are short excerpts. Each trace lists persisted event kinds and the pending proposal amount in satang where one exists. The four business-table count deltas were zero for every case in both runs.

### Tuning

| Turn | Before | After | Before → after trace |
|---|---|---|---|
| buyer | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยอด 5000 · ภายใน 2 ชั่วโมง · คุณต้องการซื้อบ้านเอง หรือต้องการรับเงินมัดจำหรือค่าบ้านจากลูกค้า? หากต้อ (201) | — → Intent check |
| deposit | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (200) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (200) | Follow-up → Intent check, Follow-up, create_payment_link, preview 500000 |
| typo | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยอด 500 · ภายใน 2 ชั่วโมง · กรุณาระบุรายละเอียดว่ารับค่าอะไร (201) | — → — |
| spoken | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | — → create_payment_link, preview 55000 |
| mixed | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | — → create_payment_link, preview 500000 |
| percent | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ราคาที่ระบุเป็นราคาต่อชิ้นหรือยอดรวมทุกชิ้น? กรุณายืนยันฐานคำนวณค่าจอง (201) | — → — |
| reference | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | เลขบิลและเบอร์โทรไม่ระบุยอดที่ต้องการรับ กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด (201) | — → — |
| precision | Assistant request failed or timed out (502) | กรุณาใช้ยอดบวกมากกว่าศูนย์ และระบุทศนิยมได้ไม่เกินสองตำแหน่ง (201) | Error → — |
| negative | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | กรุณาใช้ยอดบวกมากกว่าศูนย์ และระบุทศนิยมได้ไม่เกินสองตำแหน่ง (201) | — → — |
| status | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยังไม่พบประวัติการชำระเงินของคุณอ้อ กรุณาตรวจชื่อหรือระบุออเดอร์ (201) | — → list_transactions |
| paid | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ตรวจประวัติแล้ว ออเดอร์ที่จ่ายแล้วจะไม่ถูกทวง กรุณาระบุชื่อหรือออเดอร์ที่ต้องการตรวจสอบ (201) | — → list_transactions |
| time-alone | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ต้องการใช้เวลา 2 ชั่วโมงกับรายการใด? กรุณาระบุออเดอร์ (201) | — → — |
| preview | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | create_payment_link, preview 50000 → create_payment_link, preview 50000 |
| revise | Run is not awaiting information (409) | บันทึกยอดที่แก้เป็น 600 บาทแล้ว ยืนยันเพื่อเตรียมข้อเสนอใหม่ · create_payment_link · rejected · Supers (200) | — → create_payment_link, Revision, Revised draft |
| cancel-preview | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | Review the proposal and approve it to create the link. (201) | create_payment_link, preview 50000 → create_payment_link, preview 50000 |
| cancel | Run is not awaiting information (409) | ยกเลิกคำขอแล้ว จำนวนข้อเสนอที่ปิด: 1 · create_payment_link · rejected · Cancelled by merchant (200) | — → create_payment_link, Cancellation |
| pronoun | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | หมายถึงรายการใด? กรุณาระบุชื่อออเดอร์หรือลูกค้า (201) | — → — |
| digits | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | PayPilot ช่วยสร้างลิงก์รับเงินและตรวจยอดค้างชำระ คุณต้องการทำรายการใด? (201) | — → — |
| emoji | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | PayPilot can prepare a payment link or review outstanding payments. Which would you like to do? (201) | — → — |
| booking | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | การจองบ้านอยู่นอกขอบเขตของ PayPilot หากต้องการรับค่าจองจากลูกค้า กรุณาระบุยอดและชื่อ (201) | — → — |
| data | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | create_payment_link, preview 50000 → create_payment_link, preview 50000 |
| draft | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยอดค้าง 34100 บาท · ตัวอย่างร่างสำหรับ สตูดิโอเดือน · สวัสดีค่ะ คุณสตูดิโอเดือน ขออนุญาตแจ้งยอด 4,525 (201) | — → get_dashboard_metrics, list_unpaid_payments, draft_payment_reminder |

### Holdout

| Turn | Before | After | Before → after trace |
|---|---|---|---|
| usual | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | Which order or customer do you mean? (201) | — → — |
| today | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | Received today (Bangkok): THB 0. Outstanding: THB 34100. (201) | — → get_dashboard_metrics |
| negation | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยอดค้าง 34100 บาท · รับวันนี้ 0 บาท (201) | — → get_dashboard_metrics |
| clear | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (201) | Review the proposal and approve it to create the link. (201) | create_payment_link, preview 125000 → create_payment_link, preview 125000 |
| home | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | Amount 7200 · within 3 hours · Are you buying the house yourself, or collecting a house deposit or pay (201) | — → Intent check |
| home-confirm | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (200) | Review the proposal and approve it to create the link. (200) | Follow-up → Intent check, Follow-up, create_payment_link, preview 720000 |
| unknown | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | หมายถึงรายการใด? กรุณาระบุชื่อออเดอร์หรือลูกค้า (201) | — → — |
| time-base | กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด เช่น สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าส (201) | ยอด 750 · กรุณาระบุชื่อลูกค้า (201) | — → — |
| time-reply | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (200) | ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์ (200) | Follow-up, create_payment_link, preview 75000 → Follow-up, create_payment_link, preview 75000 |

## Local deployment

Applied the additive run-state migration and restarted the existing Orca server at http://localhost:3000/assistant without reseeding. Before and after the restart, a SHA-256 comparison over every pre-existing application field, ordered by primary key, matched. The database retained 26 orders, 26 links, 25 attempts, 5 runs, 27 actions and 0 notifications. The restarted page served the deterministic mode label and the new keyboard hint. The final verification passed 18 integration tests, strict typecheck, the production build, browser smoke and all 31 deterministic evaluation turns.
