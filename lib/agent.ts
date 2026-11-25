import { normalize, scopeReply, readIntent, isThai } from "./language";
import { claimTurn } from "./revision";
import {
  resolveDraft,
  type PaymentTerms as ConfirmedTerms,
} from "./payment-draft";
import { reminderForRequest } from "./reminder-recipient";
import { z } from "zod";
import { db, day, merchant } from "./db";
import {
  event,
  orders,
  propose,
  cursorInput,
  type OrderCursor,
} from "./service";
import { native } from "./native-agent";
import { dispatch } from "./tools";
export const hero = "ตรวจสอบยอดค้างชำระทั้งหมด วิเคราะห์ปัญหา และช่วยจัดการให้หน่อย";
async function demo(
  prompt: string,
  c: { runId: string; m: string },
  startedAt: Date,
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
    if (
      !terms &&
      !/ลิงก์|รับเงิน|เก็บ|รับชำระ|มัดจำ|payment link|collect|invoice/i.test(prompt)
    )
      return thai || /^\d+$/.test(prompt.trim())
        ? "PayPilot ช่วยสร้างลิงก์รับเงินและตรวจยอดค้างชำระ คุณต้องการทำรายการใด?"
        : "PayPilot can prepare a payment link or review outstanding payments. Which would you like to do?";
    if (!terms)
      return thai
        ? "กรุณาระบุคำขอรับเงินพร้อมรายละเอียด"
        : "Please describe the payment to collect.";
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
      let reason;
      if (+link.expires <= Date.now()) {
        await read("regenerate_payment_link", args);
        reason = "Expired checkout · replacement proposed";
      } else if (attempt?.status === "FAILED" && attempt.method === "CARD") {
        const methods = (await read("get_payment_methods", args)) as string[];
        reason = methods.includes("QR")
          ? "Card declined · offer enabled PromptPay QR"
          : "Card declined · review payment history";
      } else if (attempt?.status === "UNKNOWN") {
        await read("get_payment_history", { orderId: order.id });
        reason = "Unknown outcome · verify manually";
      } else if (Date.now() - +(attempt?.createdAt ?? order.createdAt) >= day) {
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
export async function agent(
  input: string,
  previousId?: string,
  continueRunId?: string,
  requestId?: string,
) {
  const latest = z.string().trim().min(1).max(2000).parse(input);
  const message = latest.replace(/\s*\n\s*/g, " ");
  let prompt = normalize(message);
  const selectedMode = process.env.OPENAI_API_KEY
    ? "Native provider"
    : "Deterministic demo";
  let cursor: OrderCursor | undefined;
  if (continueRunId) {
    if (previousId || prompt !== hero || selectedMode !== "Deterministic demo")
      throw Error("Invalid collection continuation");
    const marker = await db.agentAction.findFirstOrThrow({
      where: {
        runId: continueRunId,
        kind: "Continue collection",
        run: { merchant, mode: selectedMode },
      },
    });
    cursor = cursorInput.parse(JSON.parse(marker.payload).cursor);
  }
  const cancel = /^(?:ไม่เอาแล้ว|ยกเลิก|cancel\b|never mind)/i.test(prompt);
  const { run, replay } = await claimTurn(
    message,
    selectedMode,
    cancel,
    previousId,
    continueRunId,
    requestId,
  );
  if (replay)
    return db.agentRun.findFirstOrThrow({
      where: { id: run.id, merchant },
      include: { actions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
  const mode = run.mode;
  prompt = normalize(run.prompt);
  let summary: string;
  let failed = false;
  try {
    const context = { runId: run.id, m: merchant };
    const latestText = normalize(latest);
    const clarification = scopeReply(latestText, prompt);
    const timeAnswer =
      !!previousId && /^(?:อีก|ภายใน|in|within)\s*\d/i.test(latestText);
    if (cancel)
      summary = isThai(latest) ? "ยกเลิกคำขอแล้ว" : "Request cancelled.";
    else if (clarification && !timeAnswer) {
      const revision = latestText.match(
        /(?:เปลี่ยน(?:ยอด)?เป็น|change (?:it |the amount )?to)\s*([\d,.]+)/i,
      );
      summary =
        previousId && revision
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
      if (/ดูยอด|balance/i.test(prompt))
        await dispatch("get_dashboard_metrics", {}, context);
      summary = await reminderForRequest(prompt, run.id);
    } else {
      const draft = readIntent(prompt)
        ? undefined
        : resolveDraft(prompt, +run.createdAt);
      if (draft?.reply) summary = draft.reply;
      else if (mode === "Native provider")
        summary = await native(
          prompt,
          context,
          !!readIntent(prompt) ||
            (!draft?.terms &&
              !/ค้างชำระ|collection|outstanding|unpaid/i.test(prompt)),
          draft?.terms,
        );
      else
        summary = await demo(
          prompt,
          context,
          run.createdAt,
          draft?.terms,
          cursor,
        );
    }
  } catch (e) {
    failed = true;
    summary =
      e instanceof Error && /^(Agent |Provider |Tool failed)/.test(e.message)
        ? e.message
        : "Assistant request failed or timed out. Retry the request or check the server configuration.";
    await db.$transaction(async (tx) => {
      await tx.agentAction.updateMany({
        where: { runId: run.id, status: "PROPOSED" },
        data: {
          status: "REJECTED",
          result: JSON.stringify({
            summary: "Withdrawn after assistant failure",
          }),
        },
      });
      await event(run.id, "Error", summary, tx);
    });
  }
  return db.agentRun.update({
    where: { id: run.id },
    data: {
      summary,
      responseStatus: failed
        ? "FAILED"
        : summary.startsWith("NEED_INPUT") || summary.startsWith("กรุณาระบุ")
          ? "NEEDS_INPUT"
          : "COMPLETE",
    },
    include: { actions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}
