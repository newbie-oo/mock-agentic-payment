import { z } from "zod";
const reply = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().max(8000).nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                id: z.string().max(160),
                type: z.literal("function"),
                function: z.object({
                  name: z.string().max(80),
                  arguments: z.string().max(4000),
                }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
});

export async function requestModel(payload: string, signal: AbortSignal) {
  if (payload.length > 110000) throw Error("Agent context budget reached");
  const response = await fetch(
    (process.env.OPENAI_BASE_URL || "http://127.0.0.1:8317/v1").replace(
      /\/$/,
      "",
    ) + "/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "content-type": "application/json",
      },
      body: payload,
      signal,
    },
  );
  if (!response.ok || !response.body)
    throw Error("Provider unavailable (" + response.status + ")");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 64000) {
      await reader.cancel();
      throw Error("Provider response too large");
    }
    chunks.push(chunk.value);
  }
  return reply.parse(JSON.parse(Buffer.concat(chunks).toString())).choices[0]
    .message;
}

const finalMessage = z.object({
  message: z.string().trim().min(1).max(8000),
  status: z
    .enum(["complete", "needs_input"])
    .describe(
      "needs_input whenever the reply asks the merchant to specify or confirm anything",
    ),
});
export const finalFormat = {
  type: "json_schema",
  json_schema: {
    name: "merchant_reply",
    strict: true,
    schema: z.toJSONSchema(finalMessage, { target: "draft-7" }),
  },
};
export function visibleReply(content: string) {
  if (!content.trimStart().startsWith("{")) return content;
  const final = finalMessage.parse(JSON.parse(content));
  return (final.status === "needs_input" ? "NEED_INPUT " : "") + final.message;
}
