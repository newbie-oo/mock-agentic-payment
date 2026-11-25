import { z } from "zod";
import { createInput } from "./proposal-input";
import {
  explicitSum,
  referenceOnly,
  satang,
  validateQuotedMoney,
} from "./money";
import { priorPurpose, type ChatMessage } from "./native-history";
import { confirmationPrefix, type Confirmation } from "./confirmation";

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
      "create = explicit request to receive money, invoice or issue a link with sufficient details. Always choose create immediately for this, including informal Thai รับเงิน/ออกลิงก์, as approval follows later. confirm = a plausible but uncertain payer and merchant roles, or correction during such confirmation; never a general approval step. clarify = essential information missing. collect = explicit request to manage all outstanding orders with proposed changes. If a message requests any reminder draft, including AFTER checking the balance or when nobody is named, choose draft (balanceFirst=true for a balance check) and never read or collect. For payment status, including recent payments, choose read and inspect actual transactions. read/draft need evidence. purchase = shopper wants to buy something, including a price or deadline. inform = instructions or cancellations only.",
    ),
  message: z
    .string()
    .max(1500)
    .optional()
    .describe(
      "For clarify or inform: a concise answer in the merchant's language",
    ),
  payerBinding: z
    .enum(["identified", "inferred"])
    .optional()
    .describe(
      "For every create or confirm: identified when explicitly labelled customer/payer, or directly the object of an instruction to charge them. A name identified with from, จาก or ให้ลูกค้า is identified. A short name merely adjacent to a pay verb and fee is inferred.",
    ),
  requestQuote: z
    .string()
    .trim()
    .max(250)
    .optional()
    .describe(
      "For create: quote the user's verb phrase that requests merchant collection or issuing an invoice/link. Merely naming a link, a fee, or a third party paying is not an instruction to collect; omit then.",
    ),
  managementQuote: z
    .string()
    .trim()
    .max(250)
    .optional()
    .describe(
      "For collect only: quote the merchant's explicit request to manage all outstanding collections; leave absent for checking balances, conditional drafts, or requests to wait.",
    ),
  balanceFirst: z
    .boolean()
    .optional()
    .describe("Merchant explicitly asked to inspect balances before drafting"),
  expiryChanged: z
    .boolean()
    .optional()
    .describe(
      "On an edit, true only when the latest merchant message explicitly changes the expiry.",
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
      "Select one next step. A completed merchant instruction must proceed directly to create. A receiving verb and an explicitly named customer establish merchant and payer roles. Stage immediately when amount and purpose are present. Only use confirm when actor roles are actually ambiguous or editing such a confirmation. Return terms for yes/no confirmation instead of asking the user for already known fields. Choose collect for a merchant asking to review and manage all outstanding balances; never just promise action.",
    parameters: z.toJSONSchema(intentSchema, {
      io: "input",
      target: "draft-7",
    }),
  },
};
export type MerchantIntent = z.output<typeof intentSchema>;
export function allowedTool(intent: MerchantIntent["intent"], name: string) {
  if (intent === "draft")
    return [
      "get_dashboard_metrics",
      "list_unpaid_payments",
      "draft_payment_reminder",
    ].includes(name);
  if (name === "create_payment_link") return intent === "create";
  if (name === "regenerate_payment_link" || name === "save_notification")
    return intent === "collect";
  if (name === "draft_payment_reminder") return intent === "collect";
  return true;
}

type Context = {
  latest: string;
  thai: boolean;
  turn: number;
  started: Date;
  history: ChatMessage[];
  priorTerms: Confirmation | null;
  priorPreview: Confirmation | null;
};
export function interpret(
  args: unknown,
  c: Context,
): { intent: MerchantIntent; summary?: string } {
  const answer = (intent: MerchantIntent, summary: string) => ({
    intent,
    summary,
  });
  const ask = (th: string, en: string) =>
    answer({ intent: "clarify" }, "NEED_INPUT " + (c.thai ? th : en));
  const invalidAmount = () =>
    ask(
      "กรุณายืนยันยอดที่มากกว่าศูนย์เป็นบาท ทศนิยมไม่เกินสองตำแหน่ง ภายในวงเงินที่รองรับ",
      "Please confirm a positive THB amount within range with at most two decimals.",
    );
  const raw = (args as { intent?: string } | null)?.intent;
  if (raw === "create" || raw === "confirm") {
    try {
      validateQuotedMoney(c.latest);
    } catch {
      return invalidAmount();
    }
  }
  const result = intentSchema.safeParse(args);
  if (!result.success) throw Error("Provider returned invalid intent fields");
  const intent = result.data;
  if (
    intent.intent === "collect" &&
    (!intent.managementQuote || !c.latest.includes(intent.managementQuote))
  )
    intent.intent = "read";
  if (
    intent.intent === "draft" &&
    !intent.customer &&
    !intent.orderId &&
    !intent.balanceFirst
  )
    return ask(
      "ต้องการร่างข้อความถึงลูกค้าหรือออเดอร์ใด?",
      "Which customer or order should the draft be for?",
    );
  if (intent.intent === "purchase")
    return c.turn
      ? answer(
          intent,
          c.thai
            ? "รับทราบ คุณต้องการซื้อเอง PayPilot ช่วยร้านค้าออกลิงก์รับเงิน"
            : "Understood. PayPilot helps merchants collect payment.",
        )
      : ask(
          "คุณต้องการซื้อเอง หรือให้ร้านรับเงินมัดจำหรือค่าชำระ? หากต้องการรับเงิน ลูกค้าชื่ออะไร?",
          "Are you buying this yourself or collecting a deposit/payment as the merchant? If collecting, who is the customer?",
        );
  if (intent.intent === "inform" || intent.intent === "clarify") {
    if (!intent.message?.trim()) throw Error("Provider omitted the response");
    return answer(
      intent,
      (intent.intent === "clarify" ? "NEED_INPUT " : "") +
        intent.message.trim(),
    );
  }
  if (intent.intent !== "create" && intent.intent !== "confirm")
    return { intent };
  if (c.turn === 0) {
    if (intent.payerBinding === "inferred") intent.intent = "confirm";
    else if (
      intent.payerBinding === "identified" &&
      intent.requestQuote &&
      c.latest.includes(intent.requestQuote)
    )
      intent.intent = "create";
  }
  const terms = intent.terms;
  if (!terms) throw Error("Provider omitted the checkout details");
  if (!c.priorPreview && referenceOnly(c.latest))
    return ask(
      "เลขอ้างอิงใช้ระบุบิล กรุณายืนยันยอดเงินที่จะรับเป็นบาท",
      "That number identifies the bill. What THB amount should I collect?",
    );
  if (c.priorPreview) {
    const added = terms.methods.filter(
      (method) => !c.priorPreview!.methods.includes(method),
    );
    const methodLabels = { CARD: /card|บัตร/i, QR: /qr|promptpay|พร้อมเพย์/i };
    if (added.some((method) => !methodLabels[method].test(c.latest)))
      return ask(
        "ต้องการใช้วิธีชำระใดแทน? ระบุวิธีที่ต้องการก่อนตรวจข้อเสนออีกครั้ง",
        "Which alternative payment method should the preview enable?",
      );
  }
  const amountOnly =
    c.turn > 0 && /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(c.latest);
  try {
    const checked =
      explicitSum(c.latest) ??
      (amountOnly ? satang(c.latest.replaceAll(",", "")) : undefined);
    if (checked !== undefined) terms.amount = checked;
  } catch {
    return invalidAmount();
  }
  if (amountOnly) {
    const original = priorPurpose(terms.description, c.history);
    if (!original)
      return ask(
        "ยืนยันยอดแล้ว ต้องการระบุรายการหรือค่าอะไรบนลิงก์นี้?",
        "Amount confirmed. What payment description should appear on the link?",
      );
    terms.description = original;
  }
  if (c.priorPreview && !intent.expiryChanged)
    terms.expires = c.priorPreview.expires;
  terms.expires = new Date(
    terms.expires ?? +c.started + 86400000,
  ).toISOString();
  if (+new Date(terms.expires) <= Date.now())
    return ask(
      "ข้อเสนอหมดอายุแล้ว ต้องการให้ลิงก์ใหม่หมดอายุเมื่อใด?",
      "The proposed expiry has passed. What expiry should I use?",
    );
  if (
    intent.intent === "confirm" ||
    (c.priorTerms && !sameTerms(terms, c.priorTerms))
  )
    return answer(intent, confirmationPrefix + JSON.stringify(terms));
  return { intent };
}
export function sameTerms(a: Confirmation, b: Confirmation) {
  return (
    a.amount === b.amount &&
    a.customer === b.customer &&
    a.description === b.description &&
    [...a.methods].sort().join() === [...b.methods].sort().join() &&
    (!a.expires || Date.parse(a.expires) === Date.parse(b.expires!))
  );
}
