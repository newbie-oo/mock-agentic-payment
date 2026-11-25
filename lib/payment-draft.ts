import { amountUpdate } from "./payment-amount";
import {
  customerName,
  description,
  deadline,
  paymentMethods,
  type MethodState,
} from "./payment-fields";
import { isThai } from "./language";
import { satang } from "./money";

export type PaymentTerms = {
  customer: string;
  description: string;
  amount: number;
  methods: string[];
  expires: string;
};
const purchase =
  /ซื้อบ้าน|(?:buy(?:ing)?|purchas(?:e|ing))\s+(?:a\s+|the\s+)?(?:house|home)\b/i;
const collect = /(?:รับ|เก็บ)(?:เงิน|ค่า|มัดจำ|ชำระ)|\bcollect\b/i;
const create = /ลิงก์|เก็บ|รับชำระ|มัดจำ|payment link|\bcollect\b|invoice/i;
interface Draft {
  amount?: number;
  moneyQuestion?: "choice" | "number";
  customer?: string;
  description?: string;
  expires?: string;
  methods: MethodState;
}
// Each turn can update individual fields. An unresolved amount explicitly
// clears its earlier value; an omitted field preserves the previous answer.
export function resolveDraft(
  transcript: string,
  started: number,
): { reply?: string; terms?: PaymentTerms } | undefined {
  const turns = transcript.split("\n"),
    first = turns[0],
    thai = isThai(first),
    home = purchase.test(first),
    unclearPayer = !collect.test(first) && /(?:^|\s)จ่าย(?:\s|$)/.test(first);
  if (!home && !create.test(first)) return;
  // An unlabelled number following a fee and a possible payer stays
  // provisional until the merchant confirms the full interpretation.
  const shorthand =
    unclearPayer &&
    first.match(
      /(ค่า[\p{L}\p{M}]+)\s+(\d[\d,]*(?:\.\d+)?)\s+([\p{L}\p{M}]+)\s+จ่าย(?:\s|$)/u,
    );
  const candidate =
    shorthand && !/เลข|อ้างอิง|รหัส|โทร/.test(shorthand[1]) ? shorthand : null;
  let merchantIntent = !home && !unclearPayer;
  const d: Draft = { methods: { selected: [], denied: [] } };
  for (const [i, t] of turns.entries()) {
    if (i > 0 && unclearPayer) {
      if (
        collect.test(t) ||
        /^(?:ใช่|ยืนยัน|ถูกต้อง|ตกลง)(?:ค่ะ|ครับ|เลย|\s|$)/.test(t)
      ) {
        merchantIntent = true;
        if (candidate) {
          if (!d.amount && !d.moneyQuestion) {
            try {
              d.amount = satang(candidate[2].replaceAll(",", ""));
            } catch {
              d.moneyQuestion = "number";
            }
          }
          d.customer ??= candidate[3];
          d.description ??= candidate[1];
        }
      }
    }
    const amount = amountUpdate(t, i > 0 && !d.amount);
    if (amount) {
      d.amount = "amount" in amount ? amount.amount : undefined;
      d.moneyQuestion = "question" in amount ? amount.question : undefined;
    }
    const name = customerName(t);
    if (name) d.customer = name;
    else if (
      i > 0 &&
      merchantIntent &&
      !d.customer &&
      d.amount &&
      d.description &&
      /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+){0,2}$/u.test(t) &&
      !/(?:ยืนยัน|ตกลง|ใช่|ไม่|ยัง|confirm|yes|hold)/i.test(t)
    )
      d.customer = t;
    if (home) {
      if (i > 0 && collect.test(t)) {
        merchantIntent = true;
        d.description = /มัดจำ|ค่าจอง|deposit/i.test(t)
          ? thai
            ? "เงินมัดจำบ้าน"
            : "House deposit"
          : thai
            ? "ค่าบ้าน"
            : "House payment";
      }
    } else d.description = description(t) ?? d.description;
    d.expires = deadline(t, started) ?? d.expires;
    d.methods = paymentMethods(t, d.methods);
  }
  const facts = [
    d.amount !== undefined && (thai ? "ยอด " : "Amount ") + d.amount / 100,
    d.expires && (thai ? "กำหนดชำระ " : "Deadline ") + d.expires,
  ].filter(Boolean);
  const hours = turns
    .map((t) => t.match(/(\d+)\s*(?:ชม\.?|ชั่วโมง|hours?|hrs?)/i)?.[1])
    .filter(Boolean)
    .at(-1);
  if (hours)
    facts.push(
      thai ? "ภายใน " + hours + " ชั่วโมง" : "within " + hours + " hours",
    );
  function ask(question: string) {
    return { reply: "NEED_INPUT " + [...facts, question].join("\n") };
  }
  if (home && !merchantIntent)
    return ask(
      thai
        ? "คุณต้องการซื้อบ้านเอง หรือต้องการรับเงินมัดจำหรือค่าบ้านจากลูกค้า? หากต้องการรับเงิน กรุณาระบุชื่อลูกค้าด้วย"
        : "Are you buying the house or collecting a deposit from a customer? If collecting, please include the customer name.",
    );
  if (unclearPayer && !merchantIntent)
    return ask(
      candidate
        ? "ต้องการให้ร้านรับ" +
            candidate[1] +
            " " +
            Number(candidate[2].replaceAll(",", "")).toLocaleString("th-TH") +
            " บาท จากลูกค้าชื่อ" +
            candidate[3] +
            " ใช่ไหม? หากใช่ ตอบยืนยันได้เลย ลิงก์จะใช้ QR หากไม่ได้เลือกวิธีอื่น"
        : "ต้องการให้ร้านรับเงินจากลูกค้าใช่ไหม? กรุณายืนยันชื่อลูกค้าและยอดเป็นบาท",
    );
  if (d.moneyQuestion)
    return ask(
      d.moneyQuestion === "choice"
        ? thai
          ? "กรุณายืนยันยอดสุทธิที่จะเรียกเก็บเพียงยอดเดียว"
          : "Please confirm one final amount to collect."
        : thai
          ? "กรุณาระบุยอดเป็นตัวเลขบาท ทศนิยมไม่เกินสองตำแหน่ง"
          : "Please confirm the amount in baht with up to two decimals.",
    );
  if (d.methods.denied.length && !d.methods.selected.length)
    return ask(
      thai
        ? "กรุณายืนยันวิธีชำระที่ต้องการใช้ (QR หรือบัตร)"
        : "Which payment method should be enabled (QR or card)?",
    );
  if (!d.amount || !d.customer || !d.description) {
    const missing = [
      !d.amount && (thai ? "ยอดเงิน" : "the amount"),
      !d.customer && (thai ? "ชื่อลูกค้า" : "the customer name"),
      !d.description && (thai ? "รายละเอียดว่ารับค่าอะไร" : "the description"),
    ].filter(Boolean);
    return ask(
      (thai ? "กรุณาระบุ" : "Please provide ") +
        missing.join(thai ? " และ " : " and "),
    );
  }
  return {
    terms: {
      customer: d.customer,
      description: d.description,
      amount: d.amount,
      methods: d.methods.selected.length ? d.methods.selected : ["QR"],
      expires: d.expires ?? new Date(started + 86400000).toISOString(),
    },
  };
}
