# How can collection work safely on a single machine?
Parent [PayPilot delivery map](../PLAN.md) · wayfinder:task · assigned to PayPilot worker · closed

## Question
Which local boundary preserves a single collectible balance when attempts fail or a link is replaced?

## Resolution
Count open orders once. Store THB as integer satang and dates as UTC instants. Display Bangkok dates. Supersede the prior link in the same transaction as creating its replacement. Make settlement unique per order. Revalidate the original link and order when approving collection. The human approves a stored proposal ID. Default to PromptPay QR and 24 hours for new orders unless specified. Keep the model outside the database boundary.
