/**
 * Minimal, standalone GroqCloud connectivity + structured-output probe.
 *
 * Proves ALIVE can reach GroqCloud and get a real strict-schema response
 * back, independent of the full extraction pipeline -- the same shape of
 * check `packages/market-data`'s chainlink-probe.ts does for Chainlink.
 *
 * Reads GROQ_API_KEY from the environment; never prints it. Prints only the
 * response status, model, extracted content, and token usage.
 *
 * Usage:
 *   GROQ_API_KEY=... pnpm --filter @alive/intelligence probe:groq
 */

const apiKey = process.env.GROQ_API_KEY ?? process.env.LLM_API_KEY;
if (!apiKey) {
  process.stderr.write("GROQ_API_KEY (or LLM_API_KEY) is not set.\n");
  process.exit(1);
}

const model = process.env.GROQ_PROBE_MODEL ?? "openai/gpt-oss-20b";

const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_completion_tokens: 512,
    reasoning_effort: "low",
    reasoning_format: "hidden",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "groq_probe",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["issuer", "issuerSourceIds"],
          properties: {
            issuer: { type: ["string", "null"] },
            issuerSourceIds: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Extract only facts explicitly stated in the supplied source. Return strict JSON only.",
      },
      {
        role: "user",
        content:
          'SOURCE probe-001: "The Invesco Short Duration US Government Securities Fund is managed by Invesco Advisers, Inc." Who is the issuer/manager? Cite probe-001.',
      },
    ],
  }),
});

const body = (await response.json()) as {
  model?: string;
  choices?: { message?: { content?: string } }[];
  usage?: unknown;
  error?: { message?: string; code?: string };
};

process.stdout.write(`STATUS ${response.status}\n`);
if (!response.ok) {
  process.stdout.write(`ERROR ${body.error?.code ?? ""} ${body.error?.message ?? ""}\n`);
  process.exit(response.status === 429 || response.status === 413 ? 0 : 1);
}
process.stdout.write(`MODEL ${body.model}\n`);
process.stdout.write(`CONTENT ${body.choices?.[0]?.message?.content}\n`);
process.stdout.write(`USAGE ${JSON.stringify(body.usage)}\n`);
