import { Assistant } from "@/components/controls";
import { db, merchant } from "@/lib/db";
import { hero } from "@/lib/agent";
import { runDTO } from "@/lib/contract";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run: id } = await searchParams;
  const run = id
    ? await db.agentRun.findFirst({
        where: { merchant, id },
        include: { actions: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  return (
    <>
      <h1>AI Assistant</h1>
      <p className="sub">Evidence, actions and merchant approvals.</p>
      <Assistant
        initial={run ? runDTO(run) : null}
        hero={hero}
        mode={
          process.env.OPENAI_API_KEY ? "Native provider" : "Deterministic demo"
        }
      />
    </>
  );
}
