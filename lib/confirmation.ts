import { z } from "zod";
import { createInput } from "./service";
export const confirmationPrefix = "CONFIRM_INPUT ";
export function confirmation(summary: string) {
  if (!summary.startsWith(confirmationPrefix)) return null;
  const value = JSON.parse(summary.slice(confirmationPrefix.length));
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
