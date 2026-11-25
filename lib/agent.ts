import { claimTurn } from "./revision";
import { offline } from "./offline-agent";
import { z } from "zod";
import { db, merchant } from "./db";
import { event, cursorInput, type OrderCursor } from "./service";
import { native } from "./native-agent";
export const hero = "ตรวจสอบยอดค้างชำระทั้งหมด วิเคราะห์ปัญหา และช่วยจัดการให้หน่อย";
export async function agent(
  input: string,
  previousId?: string,
  continueRunId?: string,
  requestId?: string,
) {
  const latest = z.string().trim().min(1).max(2000).parse(input);
  const message = latest.replace(/\s*\n\s*/g, " ");
  const prompt = message;
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
  let summary: string;
  let failed = false;
  try {
    const context = { runId: run.id, m: merchant };
    if (cancel)
      summary = /[ก-๙]/.test(latest) ? "ยกเลิกคำขอแล้ว" : "Request cancelled.";
    else if (mode === "Native provider")
      summary = await native(run.prompt, context, run.createdAt);
    else
      summary = await offline(
        run.prompt,
        latest,
        context,
        run.createdAt,
        !!previousId,
        cursor,
      );
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
        : summary.startsWith("CONFIRM_INPUT") ||
            summary.startsWith("NEED_INPUT") ||
            summary.startsWith("กรุณาระบุ")
          ? "NEEDS_INPUT"
          : "COMPLETE",
    },
    include: { actions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}
