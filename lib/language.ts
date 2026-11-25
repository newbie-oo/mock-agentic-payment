import { day } from "./db";
import { satang } from "./money";

export const isThai = (text: string) => /[ก-๙]/.test(text);
export function normalize(text: string) {
  return text
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - "๐".charCodeAt(0)))
    .replaceAll("หลิงก์", "ลิงก์")
    .replaceAll("เกบตังค์", "เก็บเงิน");
}
const digits: Record<string, number> = {
  หนึ่ง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  ยี่: 2,
  เอ็ด: 1,
};
const digit = Object.keys(digits).join("|");
const words = new RegExp("((?:(?:" + digit + "|ร้อย|สิบ))+)(?=บาท)");
function spokenBaht(prompt: string) {
  const match = words.exec(prompt);
  if (!match) return;
  const grammar = new RegExp(
    "^(?:(" + digit + ")ร้อย)?(?:(" + digit + ")?สิบ)?(" + digit + ")?$",
  );
  const parts = grammar.exec(match[1]);
  if (!parts) return;
  return String(
    (digits[parts[1]] ?? 0) * 100 +
      (parts[0].includes("สิบ") ? (digits[parts[2]] ?? 1) * 10 : 0) +
      (digits[parts[3]] ?? 0),
  );
}
export function requestedMethods(text: string) {
  const methods: string[] = [];
  if (
    /บัตร|\bcards?\b/i.test(text) &&
    !/ไม่(?:รับ|ใช้|เอา)บัตร|no cards?/i.test(text)
  )
    methods.push("CARD");
  if (
    /คิวอาร์|พร้อมเพย์|QR|promptpay/i.test(text) &&
    !/ไม่(?:รับ|ใช้|เอา)\s*QR|no QR/i.test(text)
  )
    methods.push("QR");
  return methods.length ? methods : ["QR"];
}
export function customerName(prompt: string) {
  // Names can span words. Stop at the next checkout clause or sentence delimiter.
  const nameClause = prompt.match(
    /(?:ลูกค้า(?:ชื่อ)?|จาก(?:คุณ)?|ของคุณ|น้อง|\b(?:customer|client)\s+)\s*([^,;\n!?]+)/i,
  )?.[1];
  return (
    nameClause
      ?.split(
        /\s+(?=(?:จ่าย|ชำระ|รับทั้ง|รับบัตร|รับผ่าน|รองรับ|หมดอายุ|ภายใน|อีก\s*\d|พรุ่งนี้|ขอ QR|by\b|tomorrow\b|using\b|via\b|within\b|for\b|in \d|expires?\b|\d+(?:[,.]\d+)?\s*(?:บาท|baht|THB)|(?:บัตร|QR|card)\b))/i,
      )[0]
      .trim() ??
    prompt.match(
      /ฝากเก็บพี่(.+?)(?=(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|\d))/,
    )?.[1]
  );
}
export function paymentFields(prompt: string, started: number) {
  const thai = isThai(prompt);
  const numeric =
    prompt.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(?:บาท|baht|THB)/i)?.[1] ??
    prompt.match(/(?:THB|฿)\s*(-?\d[\d,]*(?:\.\d+)?)/i)?.[1];
  const compact = prompt.match(/(?:มัดจำ|deposit)\s*(\d+(?:\.\d+)?)k\b/i)?.[1];
  const spoken = spokenBaht(prompt);
  const value =
    numeric?.replaceAll(",", "") ??
    (compact ? String(Number(compact) * 1000) : spoken);
  const customer = customerName(prompt);
  const description =
    prompt.match(/(?:รับเงิน|เก็บเงิน)\s*((?:ค่า|เงินมัดจำ|มัดจำ).+?)\s*\d/)?.[1] ??
    prompt.match(/บาท\s*(ค่า[^\s,]+)/)?.[1] ??
    (compact ? "มัดจำ" : undefined) ??
    prompt.match(
      /(?:description[: ]+|for (?:a |an )?)(.+?)(?:,|\s+(?:for|THB|฿)|$)/i,
    )?.[1];
  const hours = prompt.match(/(\d+)\s*(?:ชม\.?|ชั่วโมง|hours?|hrs?)/i)?.[1];
  const time = prompt.match(/([01]?\d|2[0-3]):([0-5]\d)/);
  const tomorrowStart =
    (Math.floor((started + 7 * 3600000) / day) + 1) * day - 7 * 3600000;
  const expires = /พรุ่งนี้|tomorrow/i.test(prompt)
    ? new Date(
        tomorrowStart +
          (/noon|เที่ยง/i.test(prompt)
            ? 12 * 3600000
            : time
              ? (Number(time[1]) * 60 + Number(time[2])) * 60000
              : day - 1),
      )
    : new Date(started + Number(hours ?? 24) * 3600000);
  if (!value || !customer || !description) {
    const missing = [
      !value && (thai ? "ยอดเงิน" : "the amount"),
      !customer && (thai ? "ชื่อลูกค้า" : "the customer name"),
      !description &&
        (thai ? "รายละเอียดว่ารับค่าอะไร" : "the payment description"),
    ].filter(Boolean);
    const facts = [
      value && (thai ? "ยอด " : "Amount ") + value,
      hours &&
        (thai ? "ภายใน " + hours + " ชั่วโมง" : "within " + hours + " hours"),
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      reply:
        "NEED_INPUT " +
        [
          facts,
          (thai ? "กรุณาระบุ" : "Please provide ") +
            missing.join(thai ? " และ " : " and "),
        ]
          .filter(Boolean)
          .join("\n"),
    };
  }
  return {
    args: {
      customer,
      description: description.trim(),
      amount: satang(value),
      methods: requestedMethods(prompt),
      expires: expires.toISOString(),
    },
  };
}
export function scopeReply(prompt: string) {
  const thai = isThai(prompt);
  if (/^(?:ยังไม่ต้องสร้าง|อย่าเพิ่งสร้าง|hold off|don.t create)/i.test(prompt))
    return thai
      ? "ยังไม่ได้เตรียมข้อเสนอใหม่ หากต้องการดำเนินการ กรุณาระบุรายการอีกครั้ง"
      : "Creation is on hold. Specify the payment when you are ready.";
  if (/(?:คิด|ค่าจอง|deposit|มัดจำ).*\d+\s*%/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "ราคาที่ระบุเป็นราคาต่อชิ้นหรือยอดรวมทุกชิ้น? กรุณายืนยันฐานคำนวณค่าจอง"
        : "Is the quoted price per item or the total? Please confirm the deposit basis.")
    );
  if (
    /(?:เก็บ|collect|ยอด|บาท|THB)[^\n]{0,30}-\s*\d|\d+\.\d{3,}\s*(?:บาท|THB|baht)/i.test(
      prompt,
    )
  )
    return thai
      ? "กรุณาใช้ยอดบวกมากกว่าศูนย์ และระบุทศนิยมได้ไม่เกินสองตำแหน่ง"
      : "Enter a positive THB amount with at most two decimal places.";
  if (/^(?:บิล|invoice)\s*[A-Z]\d/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "เลขบิลและเบอร์โทรไม่ระบุยอดที่ต้องการรับ กรุณาระบุจำนวนเงิน ชื่อลูกค้า และรายละเอียด"
        : "Please provide the payment amount, customer and description.")
    );
  if (
    /ทำเหมือน|อันนั้น|ตามเดิม|the usual|same as (?:before|yesterday)/i.test(prompt)
  )
    return (
      "NEED_INPUT " +
      (thai
        ? "หมายถึงรายการใด? กรุณาระบุชื่อออเดอร์หรือลูกค้า"
        : "Which order or customer do you mean?")
    );
  if (/^(?:อีก|ภายใน|in|within)\s*\d/i.test(prompt))
    return (
      "NEED_INPUT " +
      (thai
        ? "ต้องการใช้เวลา " +
          (prompt.match(/\d+/)?.[0] ?? "") +
          " ชั่วโมงกับรายการใด? กรุณาระบุออเดอร์"
        : "Which order should this deadline apply to?")
    );
  if (/จองบ้านให้|book (?:a|the) house/i.test(prompt))
    return thai
      ? "การจองบ้านอยู่นอกขอบเขตของ PayPilot หากต้องการรับค่าจองจากลูกค้า กรุณาระบุยอดและชื่อ"
      : "PayPilot can collect a reservation payment. Property booking is outside its scope.";
}
export function readIntent(prompt: string) {
  if (
    /เตรียมข้อความ|draft.*remind/i.test(prompt) &&
    /ยังไม่ส่ง|do not send|don.t send|draft only/i.test(prompt)
  )
    return "draft";
  if (/จ่ายยัง|จ่ายหรือยัง|เพิ่งจ่าย|just paid|already paid/i.test(prompt))
    return "status";
  if (
    /ดูยอด|ดูรายรับ|just looking|what came in|read.only|อย่าเพิ่งทวง|ยังไม่ต้อง.*(?:ทวง|ลิงก์)/i.test(
      prompt,
    )
  )
    return "metrics";
}
