# PayPilot delivery map
Label `wayfinder:map`

## Destination
A merchant can resolve a Bangkok studio’s outstanding invoices, approve precise changes, and settle a new ฿5,000 invoice once during a three-minute local interview.

## Notes
The owner authorizes immediate delivery after planning. Use the local markdown tracker. Work solo. Build against synthetic data and a server-side configurable model endpoint.

## Decisions so far

- [How can collection work safely on a single machine?](decisions/collection.md) defines the money, evidence and approval boundary.

## Requirements and flows
Overview opens with settled revenue, attempt success rate, method mix, trend and a collection entry. Transactions displays newest attempts first. Payment Links lists orders and their latest checkout. Manual creation and assistant creation converge on a structured preview. Approval commits the stored payload and returns a verified checkout URL. Public sandbox checkout accepts a method and one of three simulated outcomes. Collection reads unpaid orders with latest evidence, groups customers, explains each recommendation, and queues eligible mutations. An operator approves individually or in bulk. Timeline records reads through verification.

## Architecture and schema
Next App Router server pages read a shared Prisma service. Client forms post to same-origin route handlers. A fixed merchant scope comes from the server. SQLite Order holds principal and settlement state, Link holds expiry and methods, Attempt holds one checkout outcome. AgentRun and AgentAction retain decisions and events. Notification records approved reminder copies. Use merchant/status/time composite indexes and link/order/time indexes, bounded pagination and grouped aggregates.

## Routes and components
Overview at /, /transactions, /links, /assistant and /pay/[id]. Shared sidebar, overview cards, trend chart, status pills, order list, creation form, sandbox controls, assistant composer, proposal cards and activity history. API handles agent requests, manual proposals, approval and checkout.

## Tools
Read metrics, transactions, one transaction, unpaid payments, history, methods and links. Draft reminders without mutation. Create, regenerate and save_notification tools stage immutable actions. Only the approval executor changes merchant records.

## Six phases and acceptance
1. Establish pinned runtime, migrations, demo reset and mixed Thai histories. Inspect fixture counts.
2. Implement order, link and attempt lifecycle. Verify stale, expired and settled checkouts.
3. Connect native function calls and deterministic adapter to validated services. Verify proposals are inert and retries reuse results.
4. Deliver collection with current evidence, suggested actions and readback. Exercise paid-before-approval and reminders.
5. Render responsive overview, history, links and workspace. Verify pagination, blank and failure states.
6. Exercise concurrency, isolation, provider bounds, checkout revenue and three-minute demonstration. Run strict typecheck, production build and regression suite.

## Not yet specified
Actual local provider availability will be recorded at verification.

## Out of scope
Real payment credentials, notification delivery, production authentication, third-party orchestration and remote publication.

## Commit and acceptance plan
Initial inspection found an empty directory with no Git metadata. Planning documents preceded implementation. Foundation, domain services and agent source were already present in the working tree when the owner requested commit slices. Preserve their chronology in this record.

| Conventional commit slice | Test | Acceptance |
|---|---|---|
| docs: plan merchant collection demo | Review six phases and glossary | Each write has a human decision boundary |
| feat: establish seeded SQLite ledger | Migrate and count fixtures | Mixed Thai histories reproduce from reset |
| feat: guard settlement and approved writes | Strict types, race and replay regressions | One settlement per order |
| feat: add bounded native collection assistant | Dispatch fixture and deterministic runs | Preview persists before mutation |
| feat: ship responsive merchant workspace | Production build and checkout walkthrough | Merchant creates, approves, copies and settles from UI |
| test: verify collection and document demo | Isolated DB suite and HTTP smoke | Results and provider limitations documented |

## Domain glossary
Merchant owns one studio ledger. Order is a customer's single debt. Link grants access to sandbox checkout for that debt. Attempt records an individual outcome. Settlement is the successful attempt that closes an order. Proposal is an immutable candidate write. Notification is a local copy of a reminder.

## Architecture decisions
- Store one order across replacements. Link history retains separate checkout identities. Attempts can fail repeatedly before settlement.
- A SQLite transaction changes OPEN to PAID and inserts a success with unique settlement order ID. A request token identifies retry of a specific checkout submission.
- Store immutable validated action payloads. Approval accepts only the stored ID and a decision. Within the same transaction recheck eligibility, apply changes, read the record back, and persist its ID and result. A replay returns the saved outcome.
- Select the deterministic adapter only at run start with an empty provider key. A configured provider failure persists an error on the native run. Both modes share the same registry and approval boundary.

## HTTP contract extension
Use the same run and action DTOs for server-rendered previews, GET inspection and POST results. Bind every lookup to the server merchant. Accept only action identity and decision during approval. Return 409 for stale checkout and 502 with an inspectable failed run on provider error. Support bounded follow-up on the same run. Commit routes, browser/HTTP regressions and copyable curl examples separately.
