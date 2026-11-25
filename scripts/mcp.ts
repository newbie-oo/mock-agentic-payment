import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createInput, recordId } from "../lib/proposal-input";
import type { ActionDTO } from "../lib/contract";

const base = new URL(process.env.PAYPILOT_ORIGIN ?? "http://127.0.0.1:3000");
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "[::1]"].includes(base.hostname) ||
  base.href !== base.origin + "/"
) {
  throw new Error(
    "PAYPILOT_ORIGIN must be a local HTTP origin using a loopback IP.",
  );
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Merchant HTTP ${response.status}: ${data.errorCode} · ${data.error}`,
    );
  return data as T;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function preview(action: ActionDTO) {
  return result({
    actionId: action.actionId,
    status: action.status,
    amountMinor: action.amountMinor,
    preview: action.payload,
    reviewUrl: new URL(
      "/assistant?run=" + encodeURIComponent(action.runId),
      base,
    ).href,
    checkoutUrl: action.checkoutUrl
      ? new URL(action.checkoutUrl, base).href
      : null,
  });
}

const server = new McpServer({ name: "paypilot", version: "1.0.0" });
server.registerTool(
  "read_outstanding",
  {
    description:
      "Read the merchant's outstanding order count and total in THB satang.",
    inputSchema: z.strictObject({}),
  },
  async () => {
    const { open, pending } = await api<{ open: number; pending: number }>(
      "/api/dashboard",
    );
    return result({ orderCount: open, amountMinor: pending, currency: "THB" });
  },
);
server.registerTool(
  "propose_payment_link",
  {
    description:
      "Prepare a sandbox payment link for merchant review. Amount is integer satang. The merchant approves in the web UI.",
    inputSchema: createInput,
  },
  async (args) =>
    preview(
      await api<ActionDTO>("/api/proposal", {
        kind: "create_payment_link",
        args,
      }),
    ),
);
server.registerTool(
  "read_action",
  {
    description:
      "Read a merchant action by its original actionId, including the checkout URL after approval.",
    inputSchema: z.strictObject({ actionId: recordId }),
  },
  async ({ actionId }) =>
    preview(
      await api<ActionDTO>("/api/action?id=" + encodeURIComponent(actionId)),
    ),
);
await server.connect(new StdioServerTransport());
