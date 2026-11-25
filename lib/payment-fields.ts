import { beforeThaiNumeral } from "./payment-amount";
export type Method = "QR" | "CARD";
export interface MethodState {
  selected: Method[];
  denied: Method[];
}
export function paymentMethods(
  text: string,
  previous: MethodState,
): MethodState {
  const selected = new Set<Method>(),
    denied = new Set(previous.denied);
  let mentioned = false,
    previousEnd = 0,
    negative = false;
  for (const m of text.matchAll(
    /บัตร(?:เครดิต|เดบิต)?|\bcards?\b|คิวอาร์|พร้อมเพย์|QR|promptpay/gi,
  )) {
    const method = /บัตร|card/i.test(m[0]) ? "CARD" : "QR";
    const before = text.slice(previousEnd, m.index);
    previousEnd = m.index + m[0].length;
    if (/(?:ค่า|ราคา)\s*$/.test(before)) continue;
    mentioned = true;
    negative =
      /(?:ไม่(?:เอา|ใช้|รับ|ต้องการ)|งด|ยกเว้น|no|not|without|except|exclude|don.t (?:use|want|accept))\s*(?:ทั้ง|either|ชำระ(?:ผ่าน|ด้วย)?)?\s*$/i.test(
        before,
      ) ||
      (negative && /^\s*(?:และ|หรือ|กับ|and|or|,)\s*$/i.test(before));
    if (negative) {
      denied.add(method);
      selected.delete(method);
    } else {
      selected.add(method);
      denied.delete(method);
    }
  }
  if (!mentioned) return previous;
  return {
    selected: selected.size
      ? [...selected]
      : previous.selected.filter((m) => !denied.has(m)),
    denied: [...denied],
  };
}
const boundary =
  /\s+(?=(?:แต่|ยัง|อย่า|ก่อน|ขอ(?:เก็บ|รับ|เปลี่ยน|เฉพาะ|ใช้| QR)|ไม่(?:เอา|รับ|ใช้|ต้องการ|ส่ง)|จ่าย|ชำระ|เก็บ|รับทั้ง|รับบัตร|รับผ่าน|รองรับ|หมดอายุ|ภายใน|อีก\s*\d|พรุ่งนี้|นัดรับ|ส่วนราคา|สำหรับ|ออเดอร์|order\b|by\b|tomorrow\b|using\b|via\b|within\b|for\b|only\b|but\b|without\b|don.t\b|do not\b|no\b|in \d|expires?\b|\d|(?:บัตร|QR|cards?)\b))/i;
export function customerName(text: string) {
  const match =
    text.match(
      /(?:จาก|ให้)?\s*(?:ลูกค้า(?:ชื่อ)?|คุณ|น้อง|พี่|\b(?:customer|client)(?: named)?\s+)\s*([^,;\n!?]+)/i,
    ) ?? text.match(/(?:จาก|ให้)\s*(?!หน่อย|จ่าย|ชำระ)([\p{L}\p{M}][^,;\n!?]*)/u);
  if (!match) return;
  const name = beforeThaiNumeral(match[1].split(boundary)[0])
    .replace(/(?:ที(?:นะ)?|ให้หน่อย|หน่อย)(?:ค่ะ|ครับ|จ้า)?$/, "")
    .trim();
  return name || undefined;
}
export function description(text: string) {
  const explicit = text.match(
    /(?:สำหรับ\s*|(?:description|description is)[: ]+)(.+?)(?=\s*(?:\d|[,;]|$))/i,
  )?.[1];
  const thai = text.match(
    /((?:ค่า(?!จองจาก)|เงินมัดจำ|มัดจำ)[^,;\n]*?)(?=\s*(?:ให้|จาก|ของคุณ|\d|แต่|$))/,
  )?.[1];
  const english = text.match(
    /\bfor (?!customer\b|client\b)(?:a |an )?(.+?)(?:,|\s+(?:for|THB|฿)|$)/i,
  )?.[1];
  return (
    (explicit ?? thai ?? english)?.replace(/(?:ให้หน่อย|ทีจ้า)$/, "").trim() ||
    undefined
  );
}
export function deadline(text: string, started: number) {
  const day = 86400000,
    hours = text.match(/(\d+)\s*(?:ชม\.?|ชั่วโมง|hours?|hrs?)/i);
  if (hours)
    return new Date(started + Number(hours[1]) * 3600000).toISOString();
  if (/พรุ่งนี้|tomorrow/i.test(text)) {
    const midnight =
      (Math.floor((started + 7 * 3600000) / day) + 1) * day - 7 * 3600000;
    const t = text.match(/([01]?\d|2[0-3]):([0-5]\d)/);
    return new Date(
      midnight +
        (/noon|เที่ยง/i.test(text)
          ? 12 * 3600000
          : t
            ? (Number(t[1]) * 60 + Number(t[2])) * 60000
            : day - 1),
    ).toISOString();
  }
}
