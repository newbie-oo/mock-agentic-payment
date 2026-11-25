import "dotenv/config";
import { agent } from "../lib/agent";
import { db } from "../lib/db";
if (!process.env.OPENAI_API_KEY)
  throw Error("OPENAI_API_KEY is required for live verification");
try {
  const run = await agent(
    "Call get_dashboard_metrics to read current merchant revenue and summarize the returned amount. Do not propose any writes.",
  );
  if (
    !run.actions.some((a) => a.kind === "get_dashboard_metrics") ||
    run.actions.some((a) => a.kind === "Error") ||
    !run.summary
  )
    throw Error("Provider did not complete the dashboard tool round trip");
  console.log(
    "Verified native get_dashboard_metrics dispatch and follow-up response; run " +
      run.id,
  );
} finally {
  await db.$disconnect();
}
