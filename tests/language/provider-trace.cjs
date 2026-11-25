// QA only. Retain role ordering and call IDs, never credentials, arguments or tool data.
const { appendFileSync } = require("node:fs");
const fetchProvider = globalThis.fetch;
globalThis.fetch = function (url, options) {
  if (
    process.env.QA_PROTOCOL_TRACE &&
    String(url).endsWith("/chat/completions") &&
    typeof options?.body === "string"
  ) {
    const messages = JSON.parse(options.body).messages;
    const roles = messages.map((m) => ({
      role: m.role,
      calls: m.tool_calls?.map((c) => ({ name: c.function.name, id: c.id })),
      replyTo: m.tool_call_id,
    }));
    appendFileSync(
      process.env.QA_PROTOCOL_TRACE,
      JSON.stringify(roles) + "\n",
      { mode: 0o600 },
    );
  }
  return fetchProvider.apply(this, arguments);
};
