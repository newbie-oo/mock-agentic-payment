# How can collection work safely on a single machine?
Parent [PayPilot delivery map](../PLAN.md) · wayfinder:task · assigned to PayPilot worker · closed

## Question
Which local boundary preserves a single collectible balance when attempts fail or a link is replaced?

## Resolution
Count open orders once. Store THB as integer satang and dates as UTC instants. Display Bangkok dates. Supersede the prior link in the same transaction as creating its replacement. Make settlement unique per order. Revalidate the original link and order when approving collection. The human approves a stored proposal ID. Default to PromptPay QR and 24 hours for new orders unless specified. Keep the model outside the database boundary.

## Transition contract

| Actor and event | Precondition | Durable change | Replay or stale request |
|---|---|---|---|
| Merchant previews | Positive integer satang, enabled sandbox method | Stored PROPOSED action | Still requires approval |
| Merchant approves create | Stored proposal, expiry in future | One OPEN order and active link | Same action ID returns saved result |
| Merchant approves replacement | Original link still active, order OPEN | Old slot cleared and new link activated | Competing replacement becomes STALE (409) |
| Customer simulates pending or failure | Live checkout, enabled method, OPEN order | Attempt only | Same request ID and payload returns prior attempt |
| Customer simulates success | Same preconditions | One success, order PAID | Conflicting token or late distinct attempt returns 409 |
| Merchant approves reminder | Original checkout still valid, OPEN order | Local Notification, verified by action ID | PAID or expired returns STALE |
| Merchant rejects | PROPOSED action | Terminal rejection | First decision wins |

A ฿5,000 card order can fail twice. Replacing its checkout leaves ฿5,000 outstanding. One successful QR settlement reduces that balance to zero and adds ฿5,000 in revenue. Across those three attempts the rate is 1/3. Calendar dates use Bangkok midnight; the ledger stores UTC instants and integer satang.
