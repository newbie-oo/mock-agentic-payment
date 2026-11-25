import { db, merchant } from "@/lib/db";
export async function GET(req: Request) {
  const run = await db.agentRun.findFirst({
    where: { merchant, id: new URL(req.url).searchParams.get("id") ?? "" },
    include: { actions: { orderBy: { createdAt: "asc" } } },
  });
  return Response.json(run, { status: run ? 200 : 404 });
}
