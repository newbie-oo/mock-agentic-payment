import { satang } from "./money";
type AmountUpdate = { amount: number } | { question: "choice" | "number" };
const digits: Record<string, number> = {
  ศูนย์: 0,
  หนึ่ง: 1,
  เอ็ด: 1,
  สอง: 2,
  ยี่: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
};
const scales: Record<string, number> = {
  สิบ: 10,
  ร้อย: 100,
  พัน: 1000,
  หมื่น: 10000,
  แสน: 100000,
  ล้าน: 1000000,
};
const numeral = Object.keys({ ...digits, ...scales }).join("|");
const spoken = new RegExp("((?:(?:" + numeral + ")\\s*)+)บาท", "g");
function thaiInteger(words: string): number | undefined {
  const tokens = words.match(new RegExp(numeral, "g")) ?? [];
  let value = 0,
    previous = Infinity,
    pending: number | undefined;
  for (const token of tokens) {
    if (token in digits) {
      if (pending !== undefined) return;
      pending = digits[token];
    } else {
      const scale = scales[token];
      if (scale >= previous || (pending === undefined && scale !== 10)) return;
      value += (pending ?? 1) * scale;
      previous = scale;
      pending = undefined;
    }
  }
  return value + (pending ?? 0);
}
const num = "-?\\d[\\d,]*(?:\\.\\d+)?";
function decimalBaht(value: string) {
  if (value.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value))
    throw Error("Unclear amount grouping");
  return satang(value.replaceAll(",", ""));
}
export function amountUpdate(
  text: string,
  awaiting: boolean,
): AmountUpdate | undefined {
  if (
    new RegExp(
      num + "\\s*(?:บาท|baht|THB)?\\s*(?:หรือ|or)\\s*(?:THB|฿)?\\s*" + num,
      "i",
    ).test(text) ||
    /จำยอด.*ไม่ได้|ราคายังไม่ได้คุย|not sure (?:of |about )?(?:the )?(?:price|amount)/i.test(
      text,
    )
  )
    return { question: "choice" };
  const values = new Set<number>();
  try {
    for (const m of text.matchAll(
      new RegExp(
        "(?:THB|฿|ราคา|price(?: of)?|เปลี่ยน(?:ยอด)?เป็น|change (?:it |the amount )?to)\\s*(" +
          num +
          ")|(" +
          num +
          ")\\s*(?:บาท|baht|THB)",
        "gi",
      ),
    ))
      values.add(decimalBaht(m[1] ?? m[2]));
    for (const m of text.matchAll(spoken)) {
      const value = thaiInteger(m[1]);
      // Never accept just the fractional suffix of a spoken price.
      const prefix = text.slice(0, m.index);
      if (/หรือ\s*$/.test(prefix)) return { question: "choice" };
      if (value === undefined || /(?:จุด|ลบ|[-.\d])\s*$/.test(prefix))
        return { question: "number" };
      values.add(satang(String(value)));
    }
    const compact = text.match(/(?:มัดจำ|deposit)\s*(\d+(?:\.\d+)?)k\b/i);
    if (compact) values.add(satang(String(Number(compact[1]) * 1000)));
    if (
      !values.size &&
      awaiting &&
      new RegExp("^" + num + "$").test(text.trim())
    )
      values.add(decimalBaht(text.trim()));
  } catch {
    return { question: "number" };
  }
  if (values.size > 1) return { question: "choice" };
  if (values.size) return { amount: [...values][0] };
  if (/บาท/.test(text)) return { question: "number" };
}
export function beforeThaiNumeral(text: string) {
  return text.split(new RegExp("(?=(?:" + numeral + ")+บาท)"))[0];
}
