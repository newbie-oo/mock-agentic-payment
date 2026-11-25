import { Assistant } from "@/components/controls";
import { db, merchant } from "@/lib/db";
import { hero } from "@/lib/agent";
export default async function Page() {
  const run = await db.agentRun.findFirst({
    where: { merchant, mode: { not: "Manual" } },
    orderBy: { createdAt: "desc" },
    include: { actions: { orderBy: { createdAt: "asc" } } },
  });
  return (
    <>
      <h1>AI Assistant</h1>
      <p className="sub">Evidence, actions and merchant approvals.</p>
      <Assistant
        initial={run}
        hero={hero}
        mode={
          process.env.OPENAI_API_KEY ? "Native provider" : "Deterministic demo"
        }
      />
    </>
  );
}
