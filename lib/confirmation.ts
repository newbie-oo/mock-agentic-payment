import { z } from "zod";
import { createInput } from "./proposal-input";
export const confirmationPrefix = "CONFIRM_INPUT ";
export const heldPrefix = "HELD_INPUT ";
export const prepareHeld = "เตรียมข้อเสนอจากข้อมูลนี้";
export function confirmation(summary: string, prefix = confirmationPrefix) {
  if (!summary.startsWith(prefix)) return null;
  const value = JSON.parse(summary.slice(prefix.length));
  return createInput.parse(value);
}
export type Confirmation = z.output<typeof createInput>;
export function question(terms: Confirmation, thai: boolean) {
  const money = (terms.amount / 100).toLocaleString(thai ? "th-TH" : "en-GB", {
    maximumFractionDigits: 2,
  });
  return thai
    ? "ต้องการให้ร้านรับ" +
        terms.description +
        " " +
        money +
        " บาท จากลูกค้าชื่อ" +
        terms.customer +
        " ผ่าน " +
        terms.methods.join(", ") +
        " ใช่ไหม?"
    : "Collect THB " +
        money +
        " for " +
        terms.description +
        " from " +
        terms.customer +
        " via " +
        terms.methods.join(", ") +
        "?";
}

export function visibleSummary(summary: string, thai: boolean) {
  const held = confirmation(summary, heldPrefix);
  if (held) {
    const display = new Intl.NumberFormat(thai ? "th-TH" : "en-GB", {
      maximumFractionDigits: 2,
    }).format(held.amount / 100);
    const expiry = new Intl.DateTimeFormat(thai ? "th-TH" : "en-GB", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(held.expires!));
    return thai
      ? `ลูกค้า ${held.customer} · ${held.description} · ${display} บาท · ${held.methods.join(", ")} · หมดอายุ ${expiry} (กรุงเทพฯ)
พักรายการไว้แล้ว เมื่อพร้อมให้เลือกเตรียมข้อเสนอ หรือตอบกลับเพื่อแก้ไข`
      : `Customer ${held.customer} · ${held.description} · THB ${display} · ${held.methods.join(", ")} · expires ${expiry} (Bangkok)
On hold. Prepare a preview when ready or reply with changes.`;
  }
  const terms = confirmation(summary);
  return terms ? question(terms, thai) : summary.replace(/^NEED_INPUT\s*/, "");
}
