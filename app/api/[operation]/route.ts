import { z } from "zod";
import { Prisma } from "@prisma/client";
import { agent } from "@/lib/agent";
import { actionDTO, runDTO } from "@/lib/contract";
import { inspectRun } from "@/lib/runs";
import { merchant, db } from "@/lib/db";
import {
  checkout,
  decide,
  propose,
  runRecord,
  metrics,
  transactions,
  getLink,
  orders,
  createInput,
  replaceInput,
} from "@/lib/service";
const id = z.string().min(1).max(100);
function json(value: unknown, status = 200) {
  const codes: Record<number, string> = {
    400: "INVALID_REQUEST",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    502: "AGENT_FAILED",
  };
  if (
    status >= 400 &&
    value &&
    typeof value === "object" &&
    !("errorCode" in value)
  )
    return Response.json(
      { ...value, errorCode: codes[status] ?? "SERVER_ERROR" },
      { status },
    );
  return Response.json(value, { status });
}
function failure(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
    return json({ error: "Record unavailable" }, 404);
  if (e instanceof z.ZodError)
    return json(
      {
        error: e.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join(", ")
          .slice(0, 500),
      },
      400,
    );
  if (e instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
  const message =
    e instanceof Error && !/prisma|database|invocation/i.test(e.message)
      ? e.message
      : "Record unavailable";
  return json(
    { error: message.slice(0, 240) },
    /already|closed|no longer|not awaiting/i.test(message) ? 409 : 400,
  );
}
type Context = { params: Promise<{ operation: string }> };
function invalidScope(req: Request) {
  return (
    req.headers.has("x-merchant-id") &&
    req.headers.get("x-merchant-id") !== merchant
  );
}
export async function GET(req: Request, { params }: Context) {
  try {
    if (invalidScope(req)) return json({ error: "Merchant unavailable" }, 403);
    const q = new URL(req.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(q.get("page") ?? 1);
    switch ((await params).operation) {
      case "dashboard":
        return json(await metrics());
      case "transactions":
        return json(await transactions(page));
      case "links":
        return json(await orders(page));
      case "link":
        return json(await getLink(id.parse(q.get("id"))));
      case "run":
        return json(await inspectRun(id.parse(q.get("id"))));
      default:
        return json({ error: "Unknown operation" }, 404);
    }
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request, { params }: Context) {
  try {
    const origin = req.headers.get("origin");
    if (
      invalidScope(req) ||
      (origin && new URL(origin).host !== req.headers.get("host"))
    )
      return json({ error: "Request forbidden" }, 403);
    const reader = req.body?.getReader();
    if (!reader) return json({ error: "Empty body" }, 400);
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16000) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    switch ((await params).operation) {
      case "agent": {
        const a = z
          .object({ prompt: z.string(), runId: id.optional() })
          .strict()
          .parse(data);
        const r = runDTO(await agent(a.prompt, a.runId));
        return json(r, r.error ? 502 : a.runId ? 200 : 201);
      }
      case "checkout":
        return json(await checkout(data));
      case "decision": {
        const a = z
          .object({ actionId: id, approve: z.boolean() })
          .strict()
          .parse(data);
        const r = actionDTO(await decide(a.actionId, a.approve));
        return json(r, r.status === "STALE" ? 409 : 200);
      }
      case "decisions": {
        const a = z
          .object({ runId: id, approve: z.boolean() })
          .strict()
          .parse(data);
        const run = await inspectRun(a.runId);
        const outcomes = [];
        for (const p of run.actions.filter((a) => a.status !== "EVENT")) {
          try {
            outcomes.push(actionDTO(await decide(p.id, a.approve)));
          } catch {
            await db.agentAction.updateMany({
              where: { id: p.id, runId: run.id, status: "PROPOSED" },
              data: {
                status: "FAILED",
                result: JSON.stringify({ summary: "Action unavailable" }),
              },
            });
            outcomes.push(
              actionDTO(
                await db.agentAction.findUniqueOrThrow({ where: { id: p.id } }),
              ),
            );
          }
        }
        return json({ run: await inspectRun(run.id), outcomes });
      }
      case "proposal": {
        const p = z
          .discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("create_payment_link"),
                args: createInput,
              })
              .strict(),
            z
              .object({
                kind: z.literal("regenerate_payment_link"),
                args: replaceInput,
              })
              .strict(),
          ])
          .parse(data);
        const run = await runRecord("Merchant payment link request", "Manual");
        return json(actionDTO(await propose(run.id, p.kind, p.args)), 201);
      }
      default:
        return json({ error: "Unknown operation" }, 404);
    }
  } catch (e) {
    return failure(e);
  }
}
