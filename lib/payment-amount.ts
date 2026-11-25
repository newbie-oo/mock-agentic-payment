import { explicitSum, satang } from "./money";

// A numeric fallback for the offline demo. The native agent reads the user's
// own text and never receives a provisional amount from this function.
export function amountUpdate(
  text: string,
  awaiting: boolean,
  allowUnitless = true,
): { amount: number } | { question: "number" | "choice" } | undefined {
  if (
    /(?:\d\s*(?:บาท|baht)?\s*(?:หรือ|or)\s*\d)|จำยอด.*ไม่ได้|ราคายังไม่ได้คุย|not sure.*(?:price|amount)/i.test(
      text,
    )
  )
    return { question: "choice" };
  if (/สตางค์|[ก-๙]บาท/.test(text)) return { question: "number" };
  const number = "-?\\d[\\d,]*(?:\\.\\d+)?";
  const labelled = new RegExp(
    "(?:THB|฿|ราคา|price(?: of)?|เปลี่ยน(?:ยอด)?เป็น|change (?:it |the amount )?to)\\s*(" +
      number +
      ")|(" +
      number +
      ")\\s*(?:บาท|baht|THB)",
    "gi",
  );
  const values = [...text.matchAll(labelled)].map((m) => m[1] ?? m[2]);
  if (allowUnitless && !values.length) {
    const afterVerb = text.match(
      new RegExp(
        "(?:รับเงิน|เก็บเงิน|เรียกเก็บ|charge|collect)\\s*(" + number + ")(?=\\s|$)",
        "i",
      ),
    );
    const afterFee = text.match(
      new RegExp("ค่า[\\p{L}\\p{M} ]+?\\s+(" + number + ")(?=\\s|$)", "u"),
    );
    const candidate = afterVerb?.[1] ?? afterFee?.[1];
    if (
      candidate &&
      !/อ้างอิง|รหัส|จำนวน|โทร|reference|phone|invoice id/i.test(text)
    )
      values.push(candidate);
  }
  if (
    !values.length &&
    awaiting &&
    new RegExp("^" + number + "$").test(text.trim())
  )
    values.push(text.trim());
  try {
    const sum = explicitSum(text);
    if (sum !== undefined) return { amount: sum };
    if (text.includes("+")) return { question: "number" };
    const unique = new Set(
      values.map((v) => {
        if (v.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(v))
          throw Error("Unclear grouping");
        return satang(v.replaceAll(",", ""));
      }),
    );
    if (unique.size > 1) return { question: "choice" };
    if (unique.size) return { amount: [...unique][0] };
  } catch {
    return { question: "number" };
  }
  if (/บาท/i.test(text)) return { question: "number" };
}
