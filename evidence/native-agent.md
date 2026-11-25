# Native Smart Link release verification

Application revision **10c311d4dd2f2ac15798b4e1ffb26396ae9567df** integrates the external stdio adapter from PR 10 and Dashboard QA from PR 11. All settlement, approval, reminder and replacement exercises below used disposable SQLite files. Production received a reviewed QA preview and its revision. The reported public checkout received read requests only.

## What caused the original response

The earlier native server interpreted the first number in `9000+3000+233` as ฿9,000 and put it into the outbound message as a confirmed checkout field. Chrome reproduced the conflict twice in run `cmww28g5u0000nqz9u4m7wers`, including after the merchant replied **12,233**. Both requests contained only the system role and a user role. The latter held pasted conversation text. Neither request called a business tool or obtained a checkout.

The independent later baseline also produced a false expiry response in run `cmww2sjht0000p2z9xue5hmth`. Its SQLite run started at 12:04:13 UTC on November 25. The provider deadline was 12:05:13 UTC that day. The stored checkout expiry was **12:04:13.336 UTC on November 26**. The model's clarification was the recorded source of the expired claim. The old action had been withdrawn and the executor never rejected a checkout as expired. The provider's internal reason for that claim is unavailable.

The independent fixed-clock run on revision `1e11f3f` exposed a different issue. Its first preview had a valid November 26 expiry. On the edit the provider returned **confirm**, **identified payer**, **บี**, **450000**, **ค่า gas**, **QR**, with the same future expiry. The server stored that confirmation and the UI correctly requested another answer. A separate real-clock run of the same revision returned **create** instead. The amended interpreter checks the new named payer and amount against the merchant's reply when revising a complete preview. Corrections to an unresolved yes/no question, and explicit holds, still wait for the merchant. A separate instructions-only failure had asked for a customer name. The guide decision now returns the actual local steps as a complete answer.

## Current behavior

- The live model receives individual user, assistant and tool messages. The server pairs tool responses with their original call IDs and saves visible history across reloads. Legacy runs recover their last visible question and the merchant's prior text from persisted data.
- A model-selected interpretation determines the available operations. Checkout staging uses one validated set of terms. A standalone confirmed amount and a single additive expression are checked in integer satang. The executor accepts one stored action ID and a human decision and reads the actual link back from the database.
- Corrections withdraw the earlier preview atomically. The server preserves a still-valid checkout expiry across unrelated edits, checks expiry against UTC server time and pauses its provider processing clock while a person reviews. An explicit refusal cannot authorize an unmentioned replacement method.
- Customer descriptions stay in user or tool data. The server's clock and expiry check are the only checkout-specific values added to system instructions. The local secret is server-side in the ignored environment file with mode 0600.
- Compared with `74ea183`, the main agent entry lost 204 lines and gained 18. Numeric fallback parsing lost 123 lines and gained 50. The offline workflow remains separate. New implementation code covers real message persistence, authorization, money validation and bounded native dispatch. The overall diff includes these additions and the live and browser harnesses.

## Deployed readback

On localhost, the native run `cmww3569f0000i7z9x8p0tfrm` staged **A · ค่า gas · 1,223,300 satang · QR** from the additive prompt in three provider turns and two function calls. The first action was `cmww359v00002i7z9o21afxgi`. The business counts were 31 orders, 36 links, 34 attempts and 2 notifications both before and after the request.

After the restart, **แก้ไขยอดเป็น 4500 บาท ลูกค้าชื่อบี** continued that same run over HTTP 200. The first action was REJECTED, the new action was `cmww39r910002pyz9b2jhp7o5`, and the preview contained **บี · ค่า gas · 450,000 satang · QR**. Both previews contained exactly `2026-11-26T12:14:02.732Z`. For this second request the counts were 32 orders, 37 links, 34 attempts and 2 notifications immediately before and after. Independent activity on the shared machine occurred between the two checks. Both test previews were left unapproved.

The logical dump hash before and after the final server restart matched at `a04074832ec168e84870e07ae3f2a9b71f6631e9ffd29bc2c89c21ef8ba8eb47`. The same run and its 450,000-satang preview survived that restart. Desktop and mobile Chrome reloaded the previously reported paid checkout, including client navigation, without errors. All ten referenced scripts loaded on each viewport. The earlier active-checkout QR decoding and screenshots are in the [checkout verification](turns-and-checkout.md).

## Tracker acceptance

| Card | What was verified |
|---|---|
| 1 | End-to-end native link creation, human approval, once-only settlement, collection approval and readback. The interview results below distinguish automation and synthesized Thai voice timing. |
| 2 | PLAN, glossary, ADRs and transition tests are present. The original sequence of historical review before every implementation change cannot be reconstructed. |
| 3 | The separate two-merchant fixture, two resets, indexed queries and two-process settlement race passed. SQLite remains the default. |
| 4 | Open, closed, expired, missing and superseded checkouts, local inert QR, conflicting request keys, lost-response replay and exactly-once revenue all passed browser or integration checks. |
| 5 | The real endpoint handled arithmetic, payer/amount correction, card-only terms, separate baht/satang, merchant-versus-buyer clarification and verified checkout readback. The corpus below records remaining variation. |
| 6 | Eligible expiry replacements, evidence-bound reminders, paid-before-approval skip, partial batch and idempotent retries passed. The live rehearsal verified two saved reminders and opened a replacement link. |
| 7 | Dashboard failure/retry/empty/data, mobile layout, attempts/rate/trend and ฿34,600 → ฿39,600 passed. The corrected conversation and checkout ran on desktop and mobile Chrome. |
| 8 | Requests and merchant UI share DTOs, action IDs and checkout readback. HTTP tests covered invalid input, scope, stale/rejected actions and duplicate requests. |
| 9 | The merged adapter was exercised as an SDK stdio client. It discovered three tools, read balances, proposed a checkout, and returned the same URL as Chrome after web approval. The earlier independent Codex client transcript is in [MCP evidence](mcp-calls.json). |

## Results by revision and mode

**Release application**. Strict TypeScript, the production build and **26/26** integration tests passed. Offline HTTP passed **61/61** across tuning (22), holdout (9), corrections (15) and further variants (15), with zero empty replies, unrequested proposals or business writes. The independent-review fixture also checked A–D against the offline adapter. It asks for numeric input for **เก้าร้อยบาทห้าสิบสตางค์**. Live acceptance decoded the same words as **90,050 satang**. Chrome smoke reached ฿39,600 from ฿34,600 exactly once, including receipt replay, two saved reminders, replacement opening and dashboard recovery. Its scripted flow took **2.18 seconds**. npm audit found zero known vulnerabilities in the locked tree.

**Six targeted native trials on the release application**. Two fixed-clock runs and two real-clock runs passed every check. Each started from A/1,223,300, retired the original action and staged บี/450,000, QR and ค่า gas. Each retained the exact expiry down to the millisecond. The accompanying instructions-only request returned COMPLETE, explained how to use Payment Links, and produced zero proposals. Order, Link, Attempt and Notification counts remained zero. On the third trial at each clock the provider returned HTTP 429 during the revision and how-to request. Those two trials failed. Their earlier previews were withdrawn and the ledger stayed unchanged. The local provider applied the rate limit while multiple evaluation suites were running. The precise provider quota and reset schedule are unknown.

**Full native acceptance on the release application**. Seven of 22 scenarios completed before or during the rate limit. They covered one-turn arithmetic, decimal arithmetic, gas shorthand, Thai baht plus satang, two card-only forms and a balance check followed by a draft-only request. The six approved QA checkouts were read back and replayed, reaching 30 orders and 30 links from 24 each. Thirteen scenarios recorded HTTP 429 in their API runs. The two Chrome scenarios observed FAILED runs in the same window. The final full native run therefore did **not** pass. It did not switch to the demo adapter. The earlier version listed below completed the browser scenarios.

**Prior integrated application** (`0bbb9f4`). Native acceptance passed **22/22**, with 14 verified checkout readbacks. After restarting the production process with a deliberately seeded legacy conflict, 390px Chrome submitted **12,233** in the same run, approved the new action and verified `/pay/82178697-d178-4d0a-9984-d2b61174476d` for A, 1,223,300 satang and QR. The desktop correction flow confirmed บี/4,500, approved once, and returned `/pay/9bf42f51-4c75-4890-9c6d-aed3030933c3`. The outbound provider trace contained separate user, assistant and tool roles across turns with matched call IDs. Four eligible collection actions returned in five provider turns and twelve calls. A Kanya Thai voice-paced native rehearsal completed in **104 seconds**; the five synthesized segments totaled **85.97 seconds**. The MCP SDK discovery, proposal, UI approval and action readback agreed on `/pay/c9a8cc0b-4b61-4d30-8923-2b3efc63c106`. On the release revision, rehearsal stopped waiting for a preview during the provider-rate-limit window. A human presenter was not timed.

**Language evaluation**. The corpus checks visible wording separately from HTTP status, monetary terms, tools, retired actions and ledger effects. In order of tuning / holdout / corrections / variants, the prior integrated revision passed **17/22, 6/9, 11/15, 9/15** of all assertions and **20/22, 7/9, 15/15, 11/15** of the contract assertions. Each of the 61 requests produced a response without business writes, unrequested proposals or unsafe amounts. Remaining variations included asking what fraction of a stated home price was the deposit and confirming a corrected fee again. These results apply to sampled conversations.

On the release revision the same four splits passed **5/22, 4/9, 3/15, 2/15** of all assertions; **35/61** responses were non-2xx, including 27 explicit upstream 429 messages. All requests returned a visible response and no sampled request changed business records before approval. The rate-limited sample cannot establish a model-quality improvement. The release was left in native mode for the coordinator's independent gate. Original and corrected snapshots, action IDs, HTTP results, provider role order and per-split counts are in [sanitized release receipts](native-receipts.json).

## Reproduce

From this checkout with the documented environment configured, run the following. Keep an existing demo ledger when starting the local application. Every QA runner below provisions its own SQLite database except the low-level provider probe, for which the commands supply a fresh directory explicitly.

```sh
npm ci
npx prisma generate
npm run typecheck
npm test
npm run build
export CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
npm run smoke
EVAL_REPORT=/tmp/paypilot-offline.json node scripts/language-eval.mjs
EVAL_REPORT=/tmp/paypilot-language-live.json node scripts/language-eval.mjs --live
LIVE_REPORT=/tmp/paypilot-native.json node scripts/live-acceptance.mjs
node scripts/revision-trials.mjs
node scripts/release-rehearsal.mjs
(
  export DATABASE_URL="file:$(mktemp -d)/provider.db"
  npm run reset
  npm run provider
)
```

The live runners use the configured loopback Chat Completions endpoint and model. Provider failures stay visible in native mode. Language tests use 25 November 2026 at 10:00 Bangkok. The release rehearsal uses the actual local clock, macOS Kanya synthesis and Chrome. Other systems can run the language suite and browser acceptance with a supported Chromium executable.
