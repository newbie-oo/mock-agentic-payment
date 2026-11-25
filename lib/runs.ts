import { db, merchant } from "./db";
import { runDTO } from "./contract";
export async function inspectRun(id: string) {
  return runDTO(
    await db.agentRun.findFirstOrThrow({
      where: { merchant, id },
      include: { actions: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    }),
  );
}
