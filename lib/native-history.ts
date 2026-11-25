import { db } from "./db";
import { visibleSummary } from "./confirmation";
export type ChatMessage = Record<string, unknown>;
// Persist only role, visible content and function-call fields, after schema validation.
export async function nativeHistory(runId: string, prompt: string) {
  const rows = await db.agentAction.findMany({
    where: { runId, kind: { in: ["Provider transcript", "Follow-up"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { kind: true, payload: true },
  });
  const history: ChatMessage[] = [];
  const recorded = new Set<number>();
  for (const r of rows.filter((r) => r.kind === "Provider transcript")) {
    const data = JSON.parse(r.payload);
    recorded.add(data.turn);
  }
  let previous = 0;
  for (const r of rows) {
    const data = JSON.parse(r.payload);
    if (r.kind === "Provider transcript") {
      history.push(...data.messages);
      continue;
    }
    if (!recorded.has(previous) && data.priorMessage)
      history.push(
        { role: "user", content: data.priorMessage },
        { role: "assistant", content: data.priorReply },
      );
    previous++;
  }
  const follow = rows.filter((r) => r.kind === "Follow-up").at(-1);
  const state = follow ? JSON.parse(follow.payload) : {};
  return {
    history,
    priorPreview: state.priorPreview ?? null,
    heldTerms: state.heldTerms ?? null,
    methodTerms: state.methodTerms ?? null,
    priorTerms: state.confirmation ?? null,
    turn: prompt.split("\n").length - 1,
  };
}
export async function recordReply(
  runId: string,
  turn: number,
  messages: ChatMessage[],
  summary: string,
  thai: boolean,
) {
  const visible = visibleSummary(summary, thai);
  await db.agentAction.create({
    data: {
      runId,
      kind: "Provider transcript",
      status: "EVENT",
      payload: JSON.stringify({
        summary: "Completed provider turn",
        turn,
        finishedAt: Date.now(),
        messages: [...messages, { role: "assistant", content: visible }],
      }),
    },
  });
  return summary;
}

// An amount-only reply cannot add new words to the earlier payment purpose.
export function priorPurpose(description: string, history: ChatMessage[]) {
  const originals = history
    .filter((m) => m.role === "user")
    .map((m) =>
      String(m.content).normalize("NFC").replace(/\s+/g, " ").toLowerCase(),
    );
  const tokens = description.trim().split(/\s+/);
  for (let n = tokens.length; n > 0; n--) {
    const prefix = tokens.slice(0, n).join(" ");
    if (
      originals.some((t) => t.includes(prefix.normalize("NFC").toLowerCase()))
    )
      return prefix;
  }
}
