import { db, merchant } from "./db";
import { satang } from "./money";
import { event } from "./service";
export function editRequest(text: string) {
  const cancel = /^(?:ไม่เอาแล้ว|ยกเลิก|cancel\b|never mind)/i.test(text.trim());
  const revision = text.match(
    /^(?:เปลี่ยน(?:ยอด)?เป็น|change (?:it |the amount )?to)\s*(\d[\d,]*(?:\.\d+)?)/i,
  );
  return cancel
    ? { kind: "cancel" as const }
    : revision
      ? {
          kind: "revise" as const,
          amount: satang(revision[1].replaceAll(",", "")),
        }
      : null;
}
export async function retirePreviews(
  runId: string,
  request: NonNullable<ReturnType<typeof editRequest>>,
  text: string,
) {
  return db.$transaction(async (tx) => {
    const run = await tx.agentRun.findFirstOrThrow({
      where: { id: runId, merchant },
      include: { actions: { where: { status: "PROPOSED" } } },
    });
    if (run.responseStatus === "PROCESSING")
      throw Error("Run already processing. Retry after the response appears.");
    if (
      request.kind === "revise" &&
      (run.actions.length !== 1 ||
        run.actions[0].kind !== "create_payment_link")
    )
      throw Error("Select a run with one pending payment link to revise.");
    const reason =
      request.kind === "cancel"
        ? "Cancelled by merchant"
        : "Superseded by merchant revision";
    const retired = await tx.agentAction.updateMany({
      where: { runId, status: "PROPOSED" },
      data: { status: "REJECTED", result: JSON.stringify({ summary: reason }) },
    });
    await event(
      runId,
      request.kind === "cancel" ? "Cancellation" : "Revision",
      reason + " · " + retired.count + " pending proposals",
      tx,
    );
    if (request.kind === "revise") {
      const revised = {
        ...JSON.parse(run.actions[0].payload),
        amount: request.amount,
      };
      await tx.agentAction.create({
        data: {
          runId,
          kind: "Revised draft",
          status: "EVENT",
          payload: JSON.stringify({ summary: reason, draft: revised }),
        },
      });
    }
    const thai = /[ก-๙]/.test(text);
    const summary =
      request.kind === "cancel"
        ? (thai
            ? "ยกเลิกคำขอแล้ว จำนวนข้อเสนอที่ปิด: "
            : "Cancelled. Pending proposals closed: ") + retired.count
        : "NEED_INPUT " +
          (thai
            ? "บันทึกยอดที่แก้เป็น " +
              request.amount / 100 +
              " บาทแล้ว ยืนยันเพื่อเตรียมข้อเสนอใหม่"
            : "Revised amount: THB " +
              request.amount / 100 +
              ". Confirm to preview a new link.");
    return tx.agentRun.update({
      where: { id: runId },
      data: {
        prompt: run.prompt + "\n" + text,
        summary,
        responseStatus: request.kind === "revise" ? "NEEDS_INPUT" : "COMPLETE",
      },
      include: { actions: { orderBy: { createdAt: "asc" } } },
    });
  });
}
