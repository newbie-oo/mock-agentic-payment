import type { AgentAction, AgentRun } from "@prisma/client";
export function actionDTO(action: AgentAction) {
  const payload = JSON.parse(action.payload) as {
    summary?: string;
    amount?: number;
    customer?: string;
    description?: string;
    currency?: string;
    methods?: string[];
    expires?: string;
    body?: string;
    linkId?: string;
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
  const error = actions.some((a) => a.kind === "Error") ? run.summary : null;
  const status = error
    ? "FAILED"
    : actions.some((a) => a.status === "PROPOSED")
      ? "AWAITING_APPROVAL"
      : run.summary.startsWith("กรุณาระบุ") ||
          run.summary.startsWith("NEED_INPUT")
        ? "NEEDS_INPUT"
        : "COMPLETE";
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
  return {
    ...run,
    runId: run.id,
    errorCode: error ? "AGENT_FAILED" : null,
    summary: [run.summary.replace(/^NEED_INPUT\s*/, ""), ...auditSummary].join(
      "\n",
    ),
    actions,
    createdAt: run.createdAt.toISOString(),
    status,
    error,
  };
}
export type ActionDTO = ReturnType<typeof actionDTO>;
export type RunDTO = ReturnType<typeof runDTO>;
