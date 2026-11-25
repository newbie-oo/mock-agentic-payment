import { merchant } from "./db";
import type { orders } from "./service";
import { isThai } from "./language";
import { customerName } from "./payment-fields";
import { dispatch } from "./tools";
import { expired } from "./expiry";
// Resolve an individual recipient before their order can reach the draft tool.
export async function reminderForRequest(transcript: string, runId: string) {
  const turns = transcript.split("\n");
  const customer = turns
    .map((t) => {
      const label = customerName(t);
      if (label) return label;
      const recipient = t.match(
        /\b(?:reminder (?:for|to)|remind)\s+(.+?)(?=\s*(?:[,;.!?]|$))/i,
      )?.[1];
      return recipient && customerName("customer " + recipient);
    })
    .filter(Boolean)
    .at(-1);
  const orderId = turns
    .map(
      (t) =>
        t.match(/(?:ออเดอร์|\border(?: id)?)\s*[:#]?\s*([a-z0-9_-]+)\b/i)?.[1] ??
        t.trim().match(/^c[a-z0-9]{10,}$/)?.[0],
    )
    .filter(Boolean)
    .at(-1);
  const context = { m: merchant, runId },
    thai = isThai(transcript);
  if (!customer && !orderId)
    return (
      "NEED_INPUT " +
      (thai
        ? "ต้องการร่างข้อความถึงใคร? กรุณาระบุชื่อลูกค้าหรือรหัสออเดอร์"
        : "Which customer or order ID should the reminder be for?")
    );
  const result = await dispatch(
    "list_unpaid_payments",
    { page: 1, customer, orderId },
    context,
  );
  if (!result.success)
    throw Error("Tool failed to check the requested recipient");
  const rows = result.data as Awaited<ReturnType<typeof orders>>;
  if (!rows.length)
    return thai
      ? "ไม่พบออเดอร์ค้างชำระที่ตรงกับ" + (customer ?? orderId ?? "คำขอ")
      : "No matching unpaid order for " +
          (customer ?? orderId ?? "this request") +
          ".";
  if (rows.length !== 1)
    return (
      "NEED_INPUT " +
      (thai
        ? "พบหลายออเดอร์ กรุณาระบุรหัสออเดอร์ที่จะร่างข้อความ"
        : "Several orders match. Please specify one order ID.") +
      (customer ? " " + rows.map((o) => o.id).join(", ") : "")
    );
  const order = rows[0],
    link = order.links[0];
  if (!link?.activeSlot || expired(link.expires))
    return thai
      ? "ลิงก์ของออเดอร์นี้ใช้ชำระไม่ได้ กรุณาตรวจสอบลิงก์ก่อนร่างข้อความ"
      : "This checkout is closed. Review its link before drafting a reminder.";
  const draft = await dispatch(
    "draft_payment_reminder",
    { linkId: link.id },
    context,
  );
  if (!draft.success)
    throw Error("Tool failed to draft the requested reminder");
  return (
    (thai ? "ร่างข้อความสำหรับ " : "Draft for ") +
    order.customer +
    " · " +
    order.id +
    "\n" +
    (draft.data as { body: string }).body
  );
}
