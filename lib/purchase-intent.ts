import { customerName } from "./language";
// Buying and collecting money are different operations. Resolve the direction
// before exposing any tools, including tools that merely stage a merchant write.
export function purchaseIntent(transcript: string) {
  const [first, ...replies] = transcript.split("\n");
  if (
    !/ซื้อบ้าน|(?:buy(?:ing)?|purchas(?:e|ing))\s+(?:a\s+|the\s+)?(?:house|home)\b/i.test(
      first,
    )
  )
    return null;
  const thai = /[ก-๙]/.test(first);
  const latest = replies.at(-1) ?? "";
  const amount =
    transcript.match(
      /(?:ราคา|price(?:\s+of)?|THB|฿)\s*([\d,]+(?:\.\d+)?)/i,
    )?.[1] ?? transcript.match(/([\d,]+(?:\.\d+)?)\s*(?:บาท|baht|THB)/i)?.[1];
  const hours = transcript.match(/(\d+)\s*(?:ชม\.?|ชั่วโมง|hours?|hrs?)/i)?.[1];
  const details = [
    amount && (thai ? "ยอด " : "Amount ") + amount,
    hours &&
      (thai ? "ภายใน " + hours + " ชั่วโมง" : "within " + hours + " hours"),
  ]
    .filter(Boolean)
    .join(" · ");
  if (
    /ซื้อเอง|เป็นผู้ซื้อ|ซื้อบ้านเอง|ต้องการซื้อบ้าน|(?:i(?:'m| am) (?:the |a )?buyer|buy(?:ing)? (?:it )?(?:myself|for myself))|ไม่(?:ต้องการ|ได้)?(?:รับ|เก็บ)|(?:do not|don't|not) (?:want to )?collect/i.test(
      latest,
    )
  ) {
    return {
      reply: thai
        ? "PayPilot ช่วยร้านค้ารับชำระเงิน การซื้อบ้านเองอยู่นอกขอบเขตของผู้ช่วยนี้"
        : "PayPilot helps merchants collect payments. Buying a home is outside this workspace.",
    };
  }
  const confirmed = replies.findLast((r) =>
    /^(?:ใช่[ ,ค่ะครับ]*|ต้องการ|ขอ|ยืนยัน(?:ว่า)?|เป็นร้านค้า\s*)*\s*(?:รับ|เก็บ)(?:เงิน|ชำระ|ค่า|มัดจำ)|^(?:yes[, ]*|i (?:want|need) to |please )*collect\b/i.test(
      r.trim(),
    ),
  );
  if (!confirmed)
    return {
      reply:
        "NEED_INPUT " +
        [
          details,
          thai
            ? "คุณต้องการซื้อบ้านเอง หรือต้องการรับเงินมัดจำหรือค่าบ้านจากลูกค้า? หากต้องการรับเงิน กรุณาระบุชื่อลูกค้าด้วย"
            : "Are you buying the house yourself, or collecting a house deposit or payment from a customer? If collecting, please include the customer’s name.",
        ]
          .filter(Boolean)
          .join("\n"),
    };
  const nameAnswer =
    confirmed !== latest &&
    replies.indexOf(confirmed) < replies.length - 1 &&
    /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+){0,3}$/u.test(latest.trim())
      ? latest.trim()
      : undefined;
  const customer = customerName(replies.join("\n")) ?? nameAnswer;
  if (!customer || !amount)
    return {
      reply:
        "NEED_INPUT " +
        details +
        "\n" +
        (thai
          ? "กรุณาระบุ" +
            [!customer && "ชื่อลูกค้า", !amount && "ยอดที่ต้องการรับ"]
              .filter(Boolean)
              .join("และ")
          : "Please provide " +
            [
              !customer && "the customer name",
              !amount && "the amount to collect",
            ]
              .filter(Boolean)
              .join(" and ")),
    };
  return {
    customer,
    amount,
    hours,
    description: /มัดจำ|ค่าจอง|deposit/i.test(confirmed)
      ? thai
        ? "เงินมัดจำบ้าน"
        : "House deposit"
      : thai
        ? "ค่าบ้าน"
        : "House payment",
  };
}
