import { confirmation, question } from "./confirmation";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { runRecord } from "./service";
import { db, merchant } from "./db";
// Claim a turn and revoke its previous preview together. If approval won the
// race first, a follow-up cannot reopen the completed order.
async function appendTurn(
  tx: Prisma.TransactionClient,
  runId: string,
  message: string,
  cancel: boolean,
) {
  const run = await tx.agentRun.findFirstOrThrow({
    where: { id: runId, merchant },
  });
  const transcript = run.prompt + "\n" + message;
  if (transcript.length > 3500) throw Error("Follow-up too long");
  if (run.responseStatus === "PROCESSING")
    throw Error("Follow-up already received");
  const pending = await tx.agentAction.findMany({
    where: { runId, status: "PROPOSED" },
    select: { id: true, kind: true, payload: true },
  });
  if (run.responseStatus !== "NEEDS_INPUT" && !pending.length)
    throw Error("Run already complete. Start a new request.");
  if (!cancel && pending.some((a) => a.kind !== "create_payment_link"))
    throw Error(
      "Review the collection actions individually or start a new request.",
    );
  await tx.agentAction.updateMany({
    where: { runId, status: "PROPOSED" },
    data: {
      status: "REJECTED",
      result: JSON.stringify({
        summary: cancel
          ? "Cancelled by merchant"
          : "Superseded by a new merchant instruction",
      }),
    },
  });
  // Carry the remaining provider execution time over a human review or clarification.
  let deadlineAt = run.deadlineAt;
  if (deadlineAt && run.mode === "Native provider") {
    const last = await tx.agentAction.findFirst({
      where: { runId, kind: "Provider transcript" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { payload: true },
    });
    const finishedAt = last ? JSON.parse(last.payload).finishedAt : undefined;
    // Before transcripts were recorded only the run start is available.
    const pausedAt =
      typeof finishedAt === "number" ? finishedAt : +run.createdAt;
    deadlineAt = new Date(+deadlineAt + Math.max(0, Date.now() - pausedAt));
  }
  const updated = await tx.agentRun.update({
    where: { id: runId },
    data: {
      summary: "Processing",
      responseStatus: "PROCESSING",
      prompt: transcript,
      deadlineAt,
    },
  });
  const terms = confirmation(run.summary);
  await tx.agentAction.create({
    data: {
      runId,
      kind: cancel ? "Cancellation" : "Follow-up",
      status: "EVENT",
      payload: JSON.stringify({
        summary:
          "Received merchant instruction; retired " +
          pending.length +
          " pending proposals",
        priorMessage: run.prompt.split("\n").at(-1),
        priorReply: terms
          ? question(terms, /[ก-๙]/.test(run.prompt))
          : run.summary.replace(/^NEED_INPUT\s*/, ""),
        confirmation: terms,
        priorPreview:
          pending.length === 1 && pending[0].kind === "create_payment_link"
            ? JSON.parse(pending[0].payload)
            : null,
      }),
    },
  });
  return updated;
}

export async function claimTurn(
  message: string,
  mode: string,
  cancel: boolean,
  previousId?: string,
  continuation?: string,
  requestId?: string,
) {
  return db.$transaction(async (tx) => {
    const id = requestId && "submission-" + requestId;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([merchant, message, previousId, continuation]))
      .digest("hex");
    if (id) {
      const receipt = await tx.agentAction.findFirst({
        where: { id, run: { merchant } },
        include: { run: true },
      });
      if (receipt) {
        if (JSON.parse(receipt.payload).fingerprint !== fingerprint)
          throw Error("Request ID already used for a different submission");
        if (receipt.run.responseStatus === "PROCESSING")
          throw Error(
            "Request already processing. Retry the same submission shortly.",
          );
        return { run: receipt.run, replay: true };
      }
    }
    const run = previousId
      ? await appendTurn(tx, previousId, message, cancel)
      : await runRecord(message, mode, merchant, tx);
    if (id)
      await tx.agentAction.create({
        data: {
          id,
          runId: run.id,
          kind: "Submission",
          status: "EVENT",
          payload: JSON.stringify({
            fingerprint,
            summary: "Merchant message received",
          }),
        },
      });
    return { run, replay: false };
  });
}
