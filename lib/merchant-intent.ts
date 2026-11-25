import { z } from "zod";
import { createInput } from "./proposal-input";
import {
  explicitSum,
  referenceOnly,
  satang,
  validateQuotedMoney,
} from "./money";
import { priorPurpose, type ChatMessage } from "./native-history";
import { paymentMethods } from "./payment-fields";
import {
  startsAsPurchase,
  requestsFullPrice,
  explicitlyHoldsPreview,
} from "./language";
import {
  confirmationPrefix,
  heldPrefix,
  methodPrefix,
  type Confirmation,
} from "./confirmation";

// Only the provider interprets free-form merchant language. This first tool
// selects permissions for the current turn. It has no business side effects.
export const intentSchema = z.object({
  intent: z
    .enum([
      "clarify",
      "confirm",
      "inform",
      "guide",
      "purchase",
      "create",
      "read",
      "draft",
      "collect",
    ])
    .describe(
      "create = explicit request to receive money, invoice or issue a link with sufficient details. Always choose create immediately for this, including informal Thai รับเงิน/ออกลิงก์, as approval follows later. confirm = a plausible but uncertain payer and merchant roles, or correction during such confirmation; never a general approval step. clarify = essential information missing. collect = explicit request to manage all outstanding orders with proposed changes. If a message requests any reminder draft, including AFTER checking the balance or when nobody is named, choose draft (balanceFirst=true for a balance check) and never read or collect. For payment status, including recent payments, choose read and inspect actual transactions. read/draft need evidence. purchase = shopper wants to buy something, including a price or deadline. guide = how-to or instructions only, even with a sample price; a customer name or approval is unnecessary. inform = cancellations or other statements.",
    ),
  message: z
    .string()
    .max(1500)
    .optional()
    .describe(
      "For clarify or inform: a concise answer in the merchant's language",
    ),
  guidanceQuote: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional()
    .describe(
      "Copy the request for instructions/how-to only if present. This always takes priority over extracting example checkout details.",
    ),
  deferPreview: z
    .boolean()
    .optional()
    .describe(
      "True only when the merchant explicitly asks to postpone preparing the preview. Correcting or excluding a deadline or payment method does not request a hold. For a held recap include the revised terms. Pure how-to uses guide.",
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
  expiryChangeQuote: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional()
    .describe(
      "On an edit copy only the words in the NEW merchant message explicitly specifying a different expiry, otherwise omit.",
    ),
  expiryOnlyUtc: z.iso
    .datetime()
    .optional()
    .describe(
      "For a duration/deadline-only instruction, return the requested UTC expiry and its expiryChangeQuote, without guessing any other checkout details. The server binds the current preview if present.",
    ),
  purposeChangeQuote: z
    .string()
    .trim()
    .min(1)
    .max(250)
    .optional()
    .describe(
      "On an edit copy only the NEW merchant wording for a different payment purpose, otherwise omit.",
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
      "For confirm/create or a deferred recap: the full latest checkout terms only, removing honorifics from personal names; retain company names",
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
export const heldTool = {
  type: "function",
  function: {
    name: "read_held_terms",
    description:
      "Return the complete checkout details for a read-only recap. Apply only the merchant’s explicit edits to the previous terms.",
    parameters: z.toJSONSchema(createInput, { io: "input", target: "draft-7" }),
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
  heldTerms?: Confirmation | null;
  methodTerms?: Confirmation | null;
};
export function interpret(
  args: unknown,
  c: Context,
): { intent: MerchantIntent; summary?: string; needsHeldTerms?: boolean } {
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
  let quotedAmounts: number[] = [];
  if (
    raw === "create" ||
    raw === "confirm" ||
    (args as { deferPreview?: boolean } | null)?.deferPreview
  ) {
    try {
      quotedAmounts = validateQuotedMoney(c.latest);
    } catch {
      return invalidAmount();
    }
  }
  const result = intentSchema.safeParse(args);
  if (!result.success) throw Error("Provider returned invalid intent fields");
  const intent = result.data;
  if (
    intent.deferPreview ||
    (c.priorPreview && ["create", "confirm"].includes(intent.intent))
  )
    intent.deferPreview = explicitlyHoldsPreview(c.latest);
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
  if (
    intent.intent === "guide" ||
    (intent.guidanceQuote && c.latest.includes(intent.guidanceQuote))
  ) {
    return answer(
      { intent: "inform" },
      c.thai
        ? "ไปที่ Payment Links แล้วเลือกสร้างลิงก์ กรอกชื่อลูกค้า รายการ ยอดเงิน วิธีชำระและวันหมดอายุ ตรวจรายละเอียดแล้วกดอนุมัติ จึงจะได้ลิงก์สำหรับคัดลอก"
        : "Open Payment Links, choose Create, then enter the customer, purpose, THB amount, payment methods and expiry. Review the preview and approve it to receive a checkout URL you can copy.",
    );
  }
  const requestTarget = () =>
    ask(
      `“${c.latest}” ต้องการใช้กับออเดอร์หรือลิงก์ใด? หากเป็นรายการใหม่ โปรดระบุรายละเอียดที่ต้องการรับเงิน`,
      `Which order or checkout link should “${c.latest}” apply to? For a new checkout, please provide the payment details.`,
    );
  if (intent.expiryOnlyUtc && ["create", "confirm"].includes(intent.intent)) {
    const previous = c.priorPreview ?? c.priorTerms;
    if (!previous) return requestTarget();
    if (
      !intent.expiryChangeQuote ||
      !c.latest.includes(intent.expiryChangeQuote)
    )
      return ask(
        "ต้องการให้ลิงก์นี้หมดอายุเมื่อใด?",
        "When should this checkout expire?",
      );
    intent.terms = { ...previous, expires: intent.expiryOnlyUtc };
    intent.intent =
      c.priorTerms || intent.deferPreview || c.heldTerms ? "confirm" : "create";
  }
  const resumeQuote =
    !intent.expiryOnlyUtc &&
    intent.requestQuote &&
    c.latest.includes(intent.requestQuote);
  if (
    !intent.deferPreview &&
    ["clarify", "confirm", "create"].includes(intent.intent)
  ) {
    if (c.priorPreview && !c.heldTerms) {
      const allowed = paymentMethods(c.latest, {
        selected: c.priorPreview.methods,
        denied: [],
      });
      if (!allowed.selected.length && allowed.denied.length)
        return answer(
          { intent: "clarify" },
          methodPrefix + JSON.stringify(c.priorPreview),
        );
    }
    if (c.methodTerms && ["confirm", "create"].includes(intent.intent)) {
      const selected = paymentMethods(c.latest, {
        selected: [],
        denied: [],
      }).selected;
      const prior = c.methodTerms;
      const expected = { ...prior, methods: selected };
      if (
        !selected.length ||
        !intent.terms ||
        !sameTerms({ ...intent.terms, expires: prior.expires }, expected) ||
        intent.expiryChangeQuote
      )
        return answer(
          { intent: "clarify" },
          methodPrefix + JSON.stringify(prior),
        );
      intent.terms = expected;
      intent.intent = "create";
    }
  }
  const holding = Boolean(
    c.priorPreview &&
    (intent.deferPreview ||
      (c.heldTerms &&
        !resumeQuote &&
        ["confirm", "create"].includes(intent.intent))),
  );

  if (holding) {
    if (!intent.terms) return { intent, needsHeldTerms: true };
    intent.intent = "confirm";
  }
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
  if (!c.priorPreview && referenceOnly(c.latest))
    return ask(
      "เลขอ้างอิงใช้ระบุบิล กรุณายืนยันยอดเงินที่จะรับเป็นบาท",
      "That number identifies the bill. What THB amount should I collect?",
    );
  const terms = intent.terms;
  if (!terms)
    return c.priorPreview || c.priorTerms
      ? ask(
          "ต้องการเปลี่ยนรายละเอียดใดของรายการเดิม และให้เปลี่ยนเป็นอะไร?",
          "Which detail of this checkout should change, and to what value?",
        )
      : requestTarget();
  const firstCustomerMessage = c.history.find((m) => m.role === "user");
  if (
    !c.priorTerms &&
    !c.priorPreview &&
    !c.methodTerms &&
    firstCustomerMessage &&
    startsAsPurchase(String(firstCustomerMessage.content)) &&
    ["deposit", "มัดจำ", "ค่าจอง"].some((word) =>
      c.latest.toLowerCase().includes(word),
    ) &&
    !requestsFullPrice(c.latest) &&
    !quotedAmounts.includes(terms.amount)
  ) {
    return ask(
      `ต้องการรับเงินมัดจำจาก ${terms.customer} เป็นจำนวนเท่าไร?`,
      `How much should the deposit from ${terms.customer} be?`,
    );
  }
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
  if (c.priorPreview) {
    if (
      !intent.expiryChangeQuote ||
      !c.latest.includes(intent.expiryChangeQuote)
    )
      terms.expires = c.priorPreview.expires;
    if (
      !intent.purposeChangeQuote ||
      !c.latest.includes(intent.purposeChangeQuote)
    )
      terms.description = c.priorPreview.description;
  }
  if (holding && c.priorPreview) {
    if (
      terms.customer !== c.priorPreview.customer &&
      !c.latest.includes(terms.customer)
    )
      return ask(
        "ต้องการให้ระบุชื่อลูกค้าคนใดในรายการที่พักไว้?",
        "Which customer should appear in the held details?",
      );
    if (
      quotedAmounts.length === 1 &&
      !/[+%]/.test(c.latest) &&
      terms.amount !== quotedAmounts[0]
    )
      return ask(
        "กรุณายืนยันยอดเงินที่ต้องการทวนเป็นบาท",
        "Please confirm the THB amount for the recap.",
      );
  }
  // A revised approval preview is distinct from a correction to an unresolved
  // payer-confirmation question. Require both changed fields in the user's reply.
  if (
    c.priorPreview &&
    !c.priorTerms &&
    !intent.deferPreview &&
    intent.intent === "confirm" &&
    intent.payerBinding === "identified" &&
    terms.customer !== c.priorPreview.customer &&
    terms.amount !== c.priorPreview.amount &&
    c.latest.includes(terms.customer) &&
    terms.description === c.priorPreview.description
  ) {
    const quoted =
      c.latest.match(/(?<![\d.,-])\d+(?:,\d{3})*(?:\.\d{1,2})?(?![\d.,])/g) ??
      [];
    if (
      quoted.some(
        (value) => Number(value.replaceAll(",", "")) === terms.amount / 100,
      )
    )
      intent.intent = "create";
  }
  if (intent.deferPreview) intent.intent = "confirm";
  terms.expires = new Date(
    terms.expires ?? +c.started + 86400000,
  ).toISOString();
  if (+new Date(terms.expires) <= Date.now())
    return ask(
      "ข้อเสนอหมดอายุแล้ว ต้องการให้ลิงก์ใหม่หมดอายุเมื่อใด?",
      "The proposed expiry has passed. What expiry should I use?",
    );
  if (holding) return answer(intent, heldPrefix + JSON.stringify(terms));
  // An affirmative correction can resolve the payer question and also amend the fee.
  // A conflicting or ungrounded payer still requires the confirmation below.
  if (
    c.priorTerms &&
    !intent.deferPreview &&
    terms.customer === c.priorTerms.customer &&
    c.latest.includes(terms.customer) &&
    terms.description === c.priorTerms.description &&
    (c.latest.startsWith("ใช่ ") || c.latest.toLowerCase().startsWith("yes,")) &&
    quotedAmounts.length === 1 &&
    quotedAmounts[0] === terms.amount &&
    (!c.priorTerms.expires || Date.parse(c.priorTerms.expires) > Date.now()) &&
    paymentMethods(c.latest, { selected: [], denied: [] })
      .selected.sort()
      .join() === [...terms.methods].sort().join()
  ) {
    intent.intent = "create";
    if (
      !intent.expiryChangeQuote ||
      !c.latest.includes(intent.expiryChangeQuote)
    )
      terms.expires = c.priorTerms.expires ?? terms.expires;
    return { intent };
  }
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
