import { confirmation, question } from "./confirmation";
import type { AgentAction, AgentRun } from "@prisma/client";
export function actionDTO(action: AgentAction) {
  const stored = JSON.parse(action.payload);
  const payload = (
    action.kind === "Provider transcript" ? { summary: stored.summary } : stored
  ) as {
    summary?: string;
    priorMessage?: string;
    priorReply?: string;
    amount?: number;
    customer?: string;
    description?: string;
    currency?: string;
    methods?: string[];
    expires?: string;
    body?: string;
    linkId?: string;
    orderId?: string;
    evidence?: {
      reason: string;
      expires: string;
      activityAt: string;
      attemptId: string | null;
      outcome: string | null;
      method: string | null;
    };
  };
  const result = action.result
    ? (JSON.parse(action.result) as {
        id?: string;
        body?: string;
        summary?: string;
        methods?: string;
      })
    : null;
  return {
    ...action,
    actionId: action.id,
    amountMinor: payload.amount ?? null,
    errorCode:
      action.status === "STALE"
        ? "STALE_ACTION"
        : action.status === "FAILED"
          ? "ACTION_FAILED"
          : null,
    payload,
    result,
    createdAt: action.createdAt.toISOString(),
    checkoutUrl: result?.methods ? "/pay/" + result.id : null,
  };
}
export function runDTO(run: AgentRun & { actions: AgentAction[] }) {
  const actions = run.actions.map(actionDTO);
  const error = run.responseStatus === "FAILED" ? run.summary : null;
  const status =
    run.responseStatus === "COMPLETE" &&
    actions.some((a) => a.status === "PROPOSED")
      ? "AWAITING_APPROVAL"
      : run.responseStatus;
  const reviewed = actions.filter((a) =>
    ["EXECUTED", "REJECTED", "STALE", "FAILED"].includes(a.status),
  );
  const auditSummary = reviewed.map(
    (a) =>
      a.kind +
      " · " +
      a.status.toLowerCase() +
      " · " +
      (a.checkoutUrl ?? a.result?.summary ?? a.result?.id ?? a.id),
  );
  let summary = run.summary.replace(/^NEED_INPUT\s*/, "");
  const verified = reviewed.find(
    (a) => a.kind === "create_payment_link" && a.checkoutUrl,
  );
  const thai = /[ก-๙]/.test(run.prompt);
  const terms = confirmation(run.summary);
  if (terms) summary = question(terms, thai);
  if (status === "COMPLETE" && verified) {
    summary =
      (thai ? "สร้างลิงก์แล้ว " : "Created checkout ") + verified.checkoutUrl;
  } else if (
    status === "COMPLETE" &&
    reviewed.every((a) => a.kind === "create_payment_link") &&
    actions.some((a) => a.kind === "Rejection")
  ) {
    summary = thai
      ? "ปฏิเสธข้อเสนอแล้ว จบคำขอนี้"
      : "Proposal rejected. This request is complete.";
  } else if (status === "COMPLETE" && reviewed.length) {
    summary = [summary, ...auditSummary].join("\n");
  }
  return {
    ...run,
    runId: run.id,
    nextAction:
      status === "NEEDS_INPUT" ? (terms ? "CONFIRM_DETAILS" : "REPLY") : null,
    deadlineAt: run.deadlineAt?.toISOString() ?? null,
    errorCode: error ? "AGENT_FAILED" : null,
    summary,
    actions,
    createdAt: run.createdAt.toISOString(),
    status,
    error,
  };
}
export type ActionDTO = ReturnType<typeof actionDTO>;
export type RunDTO = ReturnType<typeof runDTO>;
