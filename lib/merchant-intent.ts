import { z } from "zod";
import { createInput } from "./service";

// Only the provider interprets free-form merchant language. This first tool
// selects permissions for the current turn. It has no business side effects.
export const intentSchema = z.object({
  intent: z
    .enum([
      "clarify",
      "confirm",
      "inform",
      "purchase",
      "create",
      "read",
      "draft",
      "collect",
    ])
    .describe(
      "create = explicit request to receive money, invoice or issue a link with sufficient details. Always choose create immediately for this, including informal Thai รับเงิน/ออกลิงก์, as approval follows later. confirm = a plausible but uncertain payer and merchant roles, or correction during such confirmation; never a general approval step. clarify = essential information missing. collect = requested management of outstanding orders. read/draft need evidence. purchase = shopper wants to buy something, including a price or deadline. inform = instructions or cancellations only.",
    ),
  message: z
    .string()
    .max(1500)
    .optional()
    .describe(
      "For clarify or inform: a concise answer in the merchant's language",
    ),
  customer: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "For draft: exact merchant-requested customer name, without honorific. Do not infer a recipient.",
    ),
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("For draft: merchant-supplied or explicitly selected order ID"),
  terms: createInput
    .optional()
    .describe(
      "For confirm/create: the full latest checkout terms only, removing honorifics from personal names; retain company names",
    ),
});
export const intentTool = {
  type: "function",
  function: {
    name: "interpret_merchant_request",
    description:
      "Select one next step. A completed merchant instruction must proceed directly to create. Reserve confirm for ambiguous roles: a bare link noun with a fee, number, name and pay verb is one such case. Return terms for yes/no confirmation instead of asking the user for already known fields. Choose collect for a merchant asking to review and manage all outstanding balances; never just promise action.",
    parameters: z.toJSONSchema(intentSchema, {
      io: "input",
      target: "draft-7",
    }),
  },
};
export type MerchantIntent = z.output<typeof intentSchema>;
export function allowedTool(intent: MerchantIntent["intent"], name: string) {
  if (intent === "draft")
    return ["list_unpaid_payments", "draft_payment_reminder"].includes(name);
  if (name === "create_payment_link") return intent === "create";
  if (name === "regenerate_payment_link" || name === "save_notification")
    return intent === "collect";
  if (name === "draft_payment_reminder") return intent === "collect";
  return true;
}
