# Delivery ledger
1. Foundation and fixtures
2. Merchant and sandbox
3. Native agent and approvals
4. Collection workflow
5. Merchant interface
6. Verification and interview guide

Phase 1 verified migration and fixtures via SQLite counts (16 successful, 5 pending, 3 failed, 1 unknown and 2 expired links). Phase 2 domain services pass strict TypeScript. Public route and integration regressions follow in phases 5–6.

Commit slices and acceptance gates are recorded in PLAN.md. The coordinator owns remote tracking cards.
Phase 3 registry and native adapter pass strict TypeScript. Phase 4 executed the seeded collection prompt and read back 8 open orders, ฿34,100, 8 customers, 2 replacement and 2 reminder proposals. Verified eligible QR alternatives, wait and unknown outcomes in returned summary.

Phase 5 built all seven App Router surfaces successfully after aligning npm module format with TypeScript. Tracking cards: [plan](https://github.com/newbie-oo/mock-agentic-payment/issues/1), [design](https://github.com/newbie-oo/mock-agentic-payment/issues/2), [database](https://github.com/newbie-oo/mock-agentic-payment/issues/3), [checkout](https://github.com/newbie-oo/mock-agentic-payment/issues/4), [agent](https://github.com/newbie-oo/mock-agentic-payment/issues/5), [collection](https://github.com/newbie-oo/mock-agentic-payment/issues/6), [workspace](https://github.com/newbie-oo/mock-agentic-payment/issues/7).

## Verification ledger

| Status | Acceptance | Actual evidence |
|---|---|---|
| Passed | Foundation, reset and scope | Two fresh demo resets returned 24 orders, 3,460,000 settled satang and 3,410,000 outstanding. EXPLAIN selected Order_merchant_status_createdAt_idx. “two-merchant fixture reset twice with exact balances and expiry millisecond boundaries” checked 4 orders, 5 links, 4 attempts, 2 settlements and A/B totals independently. |
| Passed | Checkout and race | “two independent processes race checkout on the same SQLite file”, “immutable preview, isolation, competing approvals, checkout replay and paid-before-approval”, and “declines, replacement and settlement preserve separate attempt and order denominators”. |
| Passed | Human consent | “HTTP approval race, strict decision payload and expired-at-submit boundary” rejected tampering, verified one audit decision and validated one satang and rejected precision/range errors. Millisecond boundary covered T−1, T and T+1. |
| Passed | Mixed collection | “HTTP lost-response replay, late outcomes, partial batch and untrusted descriptions” exercised an expired replacement, paid-before-approval reminder, and injected failed proposal, then replayed all three. “collection totals, mixed evidence, approval and verified reminder readback” verified seeded recovery. |
| Passed | Agent fixture and deterministic | “native tool protocol round trip, bad arguments, parallel budget and provider failure”, “missing fields, QR 24-hour prompt, rejected proposal and invalid tool”, “English natural-language creation, provider timeout and empty collection”, and “fixed Bangkok native create, matching tool_call_id, clarification and exact readback”. Tested 25 Nov 2026 10:00 Bangkok, next-day 18:00 = 11:00 UTC; preview added zero links, approved retry yielded one. |
| Passed | API and cross-channel | “empty merchant aggregates, HTTP follow-up, rejected replay and provider HTTP failure”; production browser smoke created a proposal via API, approved in UI, compared URL with HTTP GET, retried and settled. Browser run cmww00cq6000u54z9qsyfrnuo, action cmww00cqa000v54z9rceysayk, checkout /pay/e5a77c0c-d15a-4467-9869-d2c691440156. Timed automated creation through paid dashboard took 0.35 seconds on a warmed local production server. Interview narration uses the separate three-minute script. |
| Passed | UI and interview | Desktop collection, two saved reminders, replacement checkout, mobile overview width at 390px, receipt reload and revenue ฿34,600 → ฿39,600. Full README curl block also ran on a separate fresh seed; IDs and DB count appear in README. |
| Passed | Toolchain | npm ci, Prisma generate, npm run typecheck, npm test (12 tests), npm run build, npm run smoke and npm audit (zero known vulnerabilities at verification). |
| Unverified | Live local provider | No OPENAI_API_KEY was configured for this worker. Local /v1/models returned 401 without credentials. Native HTTP fixture results above are separate from live verification. Run npm run provider with a configured server-side key. |
| Unverified | Human presentation time | Timed browser automation and a three-minute narration outline were delivered. No human interview was timed. |

The coordinator owns [HTTP contract and parity](https://github.com/newbie-oo/mock-agentic-payment/issues/8). Original plans are retained above. All six phases have implementation and local verification evidence.

## Assistant follow-up and independent remediation

Passed keyboard and submit-button reproduction on an isolated production server; implemented focused results and in-run buying-versus-collection clarification. The fixed-clock corpus improved from 6/22 to 22/22 tuning and 2/9 to 9/9 holdout in deterministic mode. The native protocol fixture was exercised independently. Live model quality remains unverified because no key was configured. All seven numbered review findings, query adjustments and reproducible checks are recorded in the [assistant review](evidence/assistant-review.md).

## Follow-up acceptance on cards 1–8

| Status | Card | Evidence |
|---|---|---|
| Passed | 1, 2, 3 | Existing six-phase plan, glossary, ADR and two-merchant/reset fixtures retained. Updated application queries and conversation receipts use the same merchant and settlement boundaries. |
| Passed | 4 | Immutable build serving; Chrome direct/reload/client navigation, decoded inert QR, mixed/card-only/expired/paid/missing links, checkout replay and settlement races. |
| Passed | 5, 6 | 61 deterministic HTTP turns; native fixture enforces corrected fields; approved deposit readback; exact recipient/order lookup with zero, one and multiple matches. |
| Passed | 7, 8 | Desktop/mobile conversation with confirmation, approval and visible verified URL; HTTP response lost after commit, replay and conflicting request ID; browser/API/SQLite agreement for the one-message gas request. |
| Unverified | 1, 2, 5, 7 | Human interview duration, historical pre-implementation review and live native model behavior. No authorized provider key was configured. |

The [follow-up evidence](evidence/turns-and-checkout.md) includes the exact reproduction commands, observed baseline, separate mode results, checkout incident and screenshots. The coordinator manages GitHub card status.
