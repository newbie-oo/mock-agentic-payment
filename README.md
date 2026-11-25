# PayPilot

A local Thai merchant workspace for collecting outstanding invoices. Review the studio ledger, prepare payment links by hand or in Thai or English, approve exact changes, and simulate checkout. Every approved action has a database readback and a timeline entry.

## Run locally

Tested with Node 26.13.1 and npm 12.2.3. SQLite runs in the application process. From a fresh clone:

```sh
npm ci
cp .env.example .env
npx prisma generate
npm run reset
npm run dev -- --hostname 127.0.0.1
```

Open **http://127.0.0.1:3000**. The reset command replaces the fixed demo merchant’s records in one transaction in the database selected by DATABASE_URL. The default file is prisma/demo.db. To preserve an existing database, run `npx prisma migrate deploy` in place of reset. Local preparation and all migrations use the locked versions.

## Local MCP client

Codex CLI 0.172.0 can read outstanding balances, prepare a payment link and read back its action ID. PayPilot serves MCP over stdio. The adapter sends requests to the merchant HTTP API on loopback. Only the web app selects and opens SQLite.

From the checkout root, start a fresh synthetic ledger on a dedicated port:

```sh
export DATABASE_URL="file:$(mktemp -d)/paypilot.db"
npm ci
npx prisma generate
npm run reset
npm run dev -- --hostname 127.0.0.1 --port 43791
```

In a second shell at the same checkout, register the server and open a signed-in interactive Codex client. The client starts the stdio process when it connects.

```sh
codex mcp add paypilot --env PAYPILOT_ORIGIN=http://127.0.0.1:43791 -- \
  "$(command -v node)" "$PWD/node_modules/tsx/dist/cli.mjs" "$PWD/scripts/mcp.ts"
codex
```

For a direct server launch, use `PAYPILOT_ORIGIN=http://127.0.0.1:43791 node node_modules/tsx/dist/cli.mjs scripts/mcp.ts`. It waits for MCP messages on stdin.

1. Ask “Use PayPilot to read the outstanding amount and order count.”
2. Ask “Prepare one QR payment link for Demo Studio for Website design, THB 5,000.” Review the preview and save its `actionId`. Open the returned `reviewUrl` in the merchant browser and click **อนุมัติและสร้างลิงก์**.
3. Ask “Use PayPilot to read action ID <paste ID> and return its checkout URL.” Compare it with **Open verified checkout** in the browser. The server exposes only `read_outstanding`, `propose_payment_link` and `read_action`. The latter reads `GET /api/action?id=…`, which scopes the action through its merchant run.

### Isolated QA on 2026-11-25

| Check | Observed result |
|---|---|
| Discovery | The SDK 1.32.2 stdio client called `tools/list` and received three tool descriptions and strict input schemas. Codex CLI 0.172.0 discovered and executed all three across two model turns. |
| Outstanding | Codex returned 8 orders and 3,410,000 satang. `GET /api/dashboard` returned `open=8, pending=3410000`. SQLite count and sum for Studio Bangkok OPEN orders matched both. |
| Proposal | Codex proposed 500,000 satang. Action `cmww23k5w0001e9z9fidfl8bp` returned PROPOSED with a null checkout URL. SQLite had 24 orders and 24 links before and after the proposal. |
| Merchant approval and readback | Playwright in Chrome clicked the approval button in the merchant UI. SQLite then contained 25 orders and 25 links. Codex read the original action ID and returned EXECUTED with the exact resolved browser URL ending in `/pay/a97b4da5-5902-4ef0-bca4-07f62695564a`. The HTTP action DTO returned the same path. |
| Invalid and foreign input | An SDK fixture called the tools with a negative amount, an extra merchant argument and an existing action seeded under another merchant. The first two returned invalid arguments and the foreign read returned HTTP 404. Order and link counts stayed at 24 each through these checks. |

The discovery response, model-selected calls, returned previews and fixture errors are recorded in [the MCP transcript](evidence/mcp-calls.json). The approval click was browser-automated for QA. All rows used a temporary database with synthetic records.

## Three-minute interview script

| เวลา | พูดและสาธิต |
|---|---|
| 0:00–0:25 | “นี่คือหน้าร้าน Studio Bangkok ยอดรับเงินจริงในเดโมคำนวณจากออเดอร์ที่จ่ายแล้ว” จดรายรับเริ่มต้น ฿34,600 และยอดค้าง ฿34,100 จาก 8 ออเดอร์ |
| 0:25–1:00 | เปิด AI Assistant พิมพ์ **สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้** ตรวจชื่อ ยอด วิธี QR และวันหมดอายุใน preview |
| 1:00–1:35 | กด Approve เปิด verified checkout และเลือก SUCCESS กลับ Overview ดูรายรับ ฿39,600 รีโหลด checkout จะเห็น Paid in full |
| 1:35–2:15 | กด Review collections แล้ว Review outstanding payments อธิบาย “ระบบดูออเดอร์กับประวัติแยกกัน ลูกค้าที่จ่ายแล้วจะไม่ถูกทวงแม้เคยจ่ายไม่ผ่าน” |
| 2:15–3:00 | ตรวจเหตุผลของลิงก์หมดอายุ บัตรล้มเหลว รายการใหม่และรายการที่ยังไม่ทราบผล กด Approve all eligible เปิดลิงก์ใหม่และดู reminder สองรายการกับบันทึก Verified ใน Activity timeline |

Try a QR deadline with **สร้างลิงก์เก็บเงินค่ามัดจำ 5,000 บาท ให้ลูกค้าชื่อสมชาย จ่ายผ่าน QR ภายใน 24 ชั่วโมง** or **Create a payment link for website design, THB 5,000 for customer Somchai tomorrow at 18:00**. New links default to QR, THB and 24 hours. Tomorrow without a time means the end of tomorrow in Bangkok.

## Agent configuration and scope

Leave OPENAI_API_KEY blank for the explicitly labelled deterministic demo. Set it in the local environment for native Chat Completions. The default OPENAI_BASE_URL is http://127.0.0.1:8317/v1 and OPENAI_MODEL is gpt-5.6-terra. Restart Next after changing configuration. `npm run provider` requires the configured key and verifies an actual dashboard tool call and follow-up reply. Provider errors are persisted on the native run.

The app runs a single agent with 11 Zod-validated tools. Reads are scoped to the server-selected merchant. The native adapter limits calls to 32, provider turns to 14, the run deadline to 60 seconds from its first native request (including clarification time), request context to 110,000 characters and each provider response to 64 KB. Reasoning fields and provider headers are excluded from persisted activity. The deterministic collection workflow reviews 60 orders per batch and offers Review next orders while more remain.

## Merchant HTTP API

All amounts in the JSON contract are integer satang. Link IDs are public sandbox handles. Sessionless merchant controls are intended for a local interview environment. The server fixes scope to Studio Bangkok. The optional X-Merchant-Id assertion must match studio-bangkok.

| Method | Path | Input | Result and typical status |
|---|---|---|---|
| GET | /api/dashboard | None | Revenue, outstanding, attempts, trend and method mix · 200 |
| GET | /api/transactions?page=1 | Page starting at 1 | Up to 12 attempts with order · 200 |
| GET | /api/links?page=1 | Page starting at 1 | Orders with current checkout and latest attempt · 200 |
| GET | /api/link?id=… | Checkout ID | Link and order · 200 or 404 |
| POST | /api/proposal | kind and args | Manual create or replacement preview · 201 |
| POST | /api/agent | prompt, optional runId for clarification/revision or continueRunId for the next deterministic collection batch | Run and action DTOs · 201 new, 200 follow-up, 502 failed provider |
| GET | /api/run?id=… | Run ID | Same run, summary, action IDs and timeline as /assistant?run=… · 200 or 404 |
| POST | /api/decision | actionId and boolean approve | Stored action and verified checkoutUrl, if applicable · 200 or 409 stale |
| POST | /api/decisions | runId and boolean approve | Run and terminal outcome per action, including stale and failed · 200 |
| POST | /api/checkout | linkId, method, status, UUID requestId | Recorded attempt · 200, 409 closed or conflicting replay |

Malformed input returns 400. A mismatched merchant assertion returns 403. A body above 16,000 bytes returns 413. Resend the same checkout requestId and payload after a lost response. Approval replay uses the original actionId. Use `approve:false` to reject a proposal. Manual create args include amount, customer, description, optional THB currency, methods and UTC ISO expires. Manual regeneration takes the current linkId.

### Copyable curl walkthrough

Run against a fresh seed in deterministic mode. Requires curl, jq and Node. The final check compares the dashboard with its original value after replaying the same settlement.

```bash
set -eu
BASE=${PAYPILOT_URL:-http://127.0.0.1:3000}
post() { curl -fsS -H 'Content-Type: application/json' -d "$2" "$BASE/api/$1"; }
before=$(curl -fsS "$BASE/api/dashboard" | jq -r '.revenue')
run=$(post agent '{"prompt":"สร้างลิงก์รับเงินค่าทำเว็บไซต์ 5,000 บาท ให้ลูกค้าสมชาย หมดอายุพรุ่งนี้"}')
run_id=$(jq -r '.runId' <<<"$run")
review=$(curl -fsS "$BASE/api/run?id=$run_id")
action_id=$(jq -r '.actions[] | select(.status=="PROPOSED") | .actionId' <<<"$review")
decision=$(jq -nc --arg id "$action_id" '{actionId:$id,approve:true}')
approved=$(post decision "$decision")
link_id=$(jq -r '.result.id' <<<"$approved")
test "$(post decision "$decision" | jq -r '.result.id')" = "$link_id"
request_id=$(node -p 'crypto.randomUUID()')
payment=$(jq -nc --arg link "$link_id" --arg req "$request_id" '{linkId:$link,requestId:$req,method:"QR",status:"SUCCESS"}')
attempt=$(post checkout "$payment" | jq -r '.id')
test "$(post checkout "$payment" | jq -r '.id')" = "$attempt"
curl -fsS "$BASE/api/link?id=$link_id" | jq '{linkId:.id,orderId,amountMinor:.order.amount,status:.order.status}'
after=$(curl -fsS "$BASE/api/dashboard" | jq -r '.revenue')
test "$((after-before))" -eq 500000
jq -nc --arg run "$run_id" --arg action "$action_id" --arg link "$link_id" --argjson delta "$((after-before))" '{runId:$run,actionId:$action,checkoutUrl:("/pay/"+$link),revenueDeltaMinor:$delta}'
```

## Architecture and limits

The App Router server pages and route handlers call the same services. Prisma stores one balance per order, a history of checkout links, and attempt outcomes. An active-slot uniqueness constraint protects replacement. Conditional order settlement and a unique settlement field protect revenue. Approval rechecks eligibility and stores the readback in the same transaction. Merchant and status indexes support pagination and aggregates. Dates are UTC instants, rendered in Asia/Bangkok. Success rate includes all recorded attempts in its denominator.

One fixed demo merchant, synthetic customers, and sandbox QR/card outcomes. The customer-name count reflects distinct display names. Repeated names retain separate order balances. Notifications stay in SQLite. Native provider support depends on the local endpoint implementing Chat Completions tool calls. The demo parser handles the documented Thai and English patterns. Plans, decisions and test evidence are in [PLAN.md](PLAN.md), [collection decisions](decisions/collection.md) and [TASKS.md](TASKS.md).

Public product inspiration includes shareable payment links, QR and card methods, and merchant reporting. PayPilot is independent. The API overview rendered as a JavaScript shell during research. [PaySo public capabilities](https://payso.co/th) · [API overview](https://api-docs.payso.co/docs/api/overviews).

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run smoke
```

The browser smoke starts a separate production server and a fresh temporary database. Set CHROME_PATH to use a local Chromium binary. On this Mac the verified invocation was `CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run smoke`. Tests cover both deterministic mode and a native-protocol provider fixture. Live verification is recorded separately in TASKS.md.

The curl block above produced this response on an isolated fresh seed. All identifiers refer to synthetic records from that run.

```json
{"linkId":"f34cb9ea-6c08-47b1-9b51-aed7e316aa22","orderId":"cmww0216e0004u1z9h7xfdrv2","amountMinor":500000,"status":"PAID"}
```

```json
{"runId":"cmww0213z0000u1z9mv7ik8va","actionId":"cmww021470001u1z9l4slort9","checkoutUrl":"/pay/f34cb9ea-6c08-47b1-9b51-aed7e316aa22","revenueDeltaMinor":500000}
```

SQLite independently reported 17 paid orders and 3,960,000 satang after replay. The fresh seed had 16 and 3,460,000 respectively.

## Assistant input and review

Enter submits the composer. Shift+Enter adds a line. Reply within the same run to supply missing information, revise a pending amount or cancel a preview. The local server distinguishes purchasing from collecting a payment before offering a merchant action. Read the [language evaluation and review evidence](evidence/assistant-review.md) for before/after results and optional live evaluation commands.
