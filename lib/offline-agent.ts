import { heldPrefix, prepareHeld } from "./confirmation";
import { createInput } from "./proposal-input";
import { normalize, scopeReply, readIntent, isThai } from "./language";
import {
  resolveDraft,
  type PaymentTerms as ConfirmedTerms,
} from "./payment-draft";
import { reminderForRequest } from "./reminder-recipient";
import { db } from "./db";
import { orders, type OrderCursor } from "./service";
import { dispatch } from "./tools";
import { recovery } from "./recovery";
async function demo(
  prompt: string,
  c: { runId: string; m: string },
  terms?: ConfirmedTerms,
  after?: OrderCursor,
) {
  const read = async (name: string, args: unknown) => {
    const r = await dispatch(name, args, c);
    if (!r.success) throw Error(r.error ?? "Tool failed");
    return r.data;
  };
  const thai = isThai(prompt);
  const intent = readIntent(prompt);
  if (intent === "status") {
    const customer = prompt.match(/คุณ([^\s]+?)(?:จ่ายยัง|จ่ายหรือยัง)/)?.[1];
    const rows = (await read("list_transactions", {
      page: 1,
      ...(customer ? { customer } : {}),
    })) as Awaited<ReturnType<typeof import("./service").transactions>>;
    if (!customer)
      return thai
        ? "ตรวจประวัติแล้ว ออเดอร์ที่จ่ายแล้วจะไม่ถูกทวง กรุณาระบุชื่อหรือออเดอร์ที่ต้องการตรวจสอบ"
        : "Paid orders are excluded. Which customer or order should I check?";
    return rows.length
      ? rows
          .map(
            (r) =>
              r.order.customer + " · " + r.orderId + " · " + r.order.status,
          )
          .join("\n")
      : "ยังไม่พบประวัติการชำระเงินของคุณ" + customer + " กรุณาตรวจชื่อหรือระบุออเดอร์";
  }
  if (intent) {
    const totals = (await read("get_dashboard_metrics", {})) as Awaited<
      ReturnType<typeof import("./service").metrics>
    >;
    const date = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const today = (totals.trend.find((d) => d.date === date)?.total ?? 0) / 100;
    return thai
      ? "ยอดค้าง " + totals.pending / 100 + " บาท · รับวันนี้ " + today + " บาท"
      : "Received today (Bangkok): THB " +
          today +
          ". Outstanding: THB " +
          totals.pending / 100 +
          ".";
  }
  if (!/ค้างชำระ|collection|outstanding|unpaid/i.test(prompt)) {
    if (!terms)
      return (
        "NEED_INPUT " +
        (thai || /^\d+$/.test(prompt.trim())
          ? "PayPilot ช่วยสร้างลิงก์รับเงินและตรวจยอดค้างชำระ คุณต้องการทำรายการใด?"
          : "PayPilot can prepare a payment link or review outstanding payments. Which would you like to do?")
      );
    await read("create_payment_link", terms);
    return thai
      ? "ตรวจสอบรายละเอียดแล้วกด Approve เพื่อสร้างลิงก์"
      : "Review the proposal and approve it to create the link.";
  }
  const totals = (await read("get_dashboard_metrics", {})) as Awaited<
    ReturnType<typeof import("./service").metrics>
  >;
  const lines = [
    totals.open +
      " open orders · " +
      totals.customers +
      " distinct customer names · ฿" +
      (totals.pending / 100).toLocaleString(),
  ];
  let cursor = after,
    reviewed = 0;
  const grouped = new Map<string, string[]>();
  for (let batch = 0; batch < 5; batch++) {
    const data = (await read("list_unpaid_payments", {
      page: 1,
      before: cursor,
    })) as Awaited<ReturnType<typeof orders>>;
    if (!data.length) break;
    reviewed += data.length;
    const last = data[data.length - 1];
    cursor = { id: last.id, createdAt: last.createdAt.toISOString() };
    for (const order of data) {
      const link = order.links[0],
        attempt = order.attempts[0];
      const args = { linkId: link.id };
      const next = recovery(order, link, attempt);
      let reason;
      if (next === "REPLACE") {
        await read("regenerate_payment_link", args);
        reason = "Expired checkout · replacement proposed";
      } else if (next === "CHECK_METHODS") {
        const methods = (await read("get_payment_methods", args)) as string[];
        reason = methods.includes("QR")
          ? "Card declined · offer enabled PromptPay QR"
          : "Card declined · review payment history";
      } else if (next === "VERIFY") {
        await read("get_payment_history", { orderId: order.id });
        reason = "Unknown outcome · verify manually";
      } else if (next === "REMIND") {
        const { body } = (await read("draft_payment_reminder", args)) as {
          body: string;
        };
        await read("save_notification", { ...args, body });
        reason = "Overdue · reminder ready for approval";
      } else reason = "Recent invoice · wait";
      const rows = grouped.get(order.customer) ?? [];
      rows.push(order.description + " · " + order.id + " · " + reason);
      grouped.set(order.customer, rows);
    }
  }
  for (const [name, items] of grouped)
    lines.push(name + "\n" + items.join("\n"));
  if (
    reviewed === 60 &&
    cursor &&
    (await orders(1, true, c.m, 1, cursor)).length
  ) {
    await db.agentAction.create({
      data: {
        runId: c.runId,
        kind: "Continue collection",
        status: "EVENT",
        payload: JSON.stringify({
          summary: "Additional open orders remain",
          cursor,
        }),
      },
    });
  }
  lines.push(
    "Settled orders excluded. Reviewed " +
      reviewed +
      " open orders in this batch.",
  );
  return lines.join("\n");
}
export async function offline(
  transcript: string,
  latest: string,
  context: { m: string; runId: string },
  started: Date,
  previous: boolean,
  cursor?: OrderCursor,
) {
  let summary: string;
  const prompt = normalize(transcript);
  const latestText = normalize(latest);
  const recap =
    /(?:ทวน|recap|review the details)/i.test(latestText) &&
    /(?:ยังไม่|อย่าเพิ่ง|พัก|hold|do not|don.t|before preparing)/i.test(latestText);
  const resume =
    [prepareHeld, "Prepare this preview"].includes(latest) ||
    /^(?:ช่วย)?เตรียมข้อเสนอ(?:ได้เลย|เลย|ให้หน่อย)?$|^(?:please )?prepare (?:the |a )?preview(?: now)?[.!]?$/i.test(
      latestText,
    );
  const clarification = scopeReply(latestText, prompt);
  if (previous) {
    const follow = await db.agentAction.findFirst({
      where: {
        runId: context.runId,
        run: { merchant: context.m },
        kind: "Follow-up",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { payload: true },
    });
    const state = follow && JSON.parse(follow.payload);
    if (resume && state?.heldTerms) {
      const proposal = await dispatch(
        "create_payment_link",
        createInput.parse(state.heldTerms),
        context,
      );
      if (!proposal.success)
        throw Error("Tool failed to prepare the reviewed checkout");
      return isThai(transcript)
        ? "ตรวจข้อเสนอแล้วกดอนุมัติเพื่อสร้างลิงก์"
        : "Review the proposal and approve it to create the link.";
    }
    if (
      (recap && state?.priorPreview) ||
      (state?.heldTerms && !clarification)
    ) {
      const draft = resolveDraft(prompt, +started);
      if (draft?.terms)
        return heldPrefix + JSON.stringify(createInput.parse(draft.terms));
      return (
        draft?.reply ??
        "NEED_INPUT " +
          (isThai(latest)
            ? "ต้องการแก้ไขข้อมูลใดก่อนทวนรายการ?"
            : "Which details should I revise for the recap?")
      );
    }
  }
  const timeAnswer =
    previous && /^(?:อีก|ภายใน|in|within)\s*\d/i.test(latestText);
  if (clarification && !timeAnswer) {
    const revision = latestText.match(
      /(?:เปลี่ยน(?:ยอด)?เป็น|change (?:it |the amount )?to)\s*([\d,.]+)/i,
    );
    summary =
      previous && revision
        ? "NEED_INPUT " +
          clarification +
          " · " +
          revision[1] +
          " · " +
          (isThai(latest)
            ? "ยืนยันเพื่อเตรียมข้อเสนอใหม่"
            : "Confirm to prepare a new preview.")
        : clarification;
  } else if (readIntent(prompt) === "draft") {
    summary = await reminderForRequest(prompt, context.runId);
    if (/ดูยอด|balance/i.test(prompt)) {
      const metrics = await dispatch("get_dashboard_metrics", {}, context);
      if (!metrics.success) throw Error("Tool failed to read the balance");
      const balance = (metrics.data as { pending: number }).pending / 100;
      summary +=
        "\n" +
        (isThai(latest)
          ? "ยอดค้างของร้าน "
          : "Merchant outstanding balance THB ") +
        balance.toLocaleString("th-TH") +
        (isThai(latest) ? " บาท" : "");
    }
  } else {
    const draft = readIntent(prompt)
      ? undefined
      : resolveDraft(prompt, +started);
    if (draft?.reply) summary = draft.reply;
    else summary = await demo(prompt, context, draft?.terms, cursor);
  }
  return summary;
}
