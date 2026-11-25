import { z } from "zod";
import { NextResponse } from "next/server";
import { agent } from "@/lib/agent";
import { checkout, decide, propose, runRecord } from "@/lib/service";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin)
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const text = await req.text();
    if (text.length > 5000) throw Error("Request too large");
    const data = JSON.parse(text);
    switch ((await params).operation) {
      case "agent":
        return NextResponse.json(await agent(data.prompt));
      case "checkout":
        return NextResponse.json(await checkout(data));
      case "decision": {
        const a = z
          .object({ actionId: z.string(), approve: z.boolean() })
          .strict()
          .parse(data);
        return NextResponse.json(await decide(a.actionId, a.approve));
      }
      case "proposal": {
        const p = z
          .object({
            kind: z.enum(["create_payment_link", "regenerate_payment_link"]),
            args: z.unknown(),
          })
          .strict()
          .parse(data);
        const run = await runRecord("Merchant payment link request", "Manual");
        return NextResponse.json(await propose(run.id, p.kind, p.args));
      }
      default:
        return NextResponse.json(
          { error: "Unknown operation" },
          { status: 404 },
        );
    }
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((x) => x.path.join(".") + " " + x.message).join(", ")
        : e instanceof Error && !/prisma|invocation|database/i.test(e.message)
          ? e.message
          : "Record unavailable";
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 400 });
  }
}
