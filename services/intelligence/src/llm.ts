import { z } from "zod";

import type { IntelligenceConfig, LlmProviderName } from "./config.js";

export type LlmHealth = {
  provider: LlmProviderName;
  configured: boolean;
  mode: "AI" | "OFFLINE";
  model?: string;
  message: string;
};

export type LlmPolicyRequest = {
  mandate: string;
  systemPrompt: string;
  /**
   * Optional strict JSON-schema request. Only honored by providers that
   * support constrained-decoding structured output (currently Groq); other
   * providers ignore it and fall back to their normal JSON mode. Either way,
   * the caller re-validates the response with Zod -- provider-level schema
   * compliance is a reliability improvement, not a trust boundary.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
};

export interface LlmJsonProvider {
  readonly name: LlmProviderName;
  readonly model?: string;
  generatePolicyJson(request: LlmPolicyRequest): Promise<unknown>;
  health(): LlmHealth;
}

export class LlmProviderError extends Error {
  constructor(
    readonly code:
      | "LLM_OFFLINE"
      | "LLM_MISCONFIGURED"
      | "LLM_UNAVAILABLE"
      | "LLM_RESPONSE_INVALID",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LlmProviderError";
  }
}

function parseJsonContent(content: unknown): unknown {
  if (typeof content === "object" && content !== null) return content;
  if (typeof content !== "string") {
    throw new LlmProviderError(
      "LLM_RESPONSE_INVALID",
      "The model did not return JSON content.",
    );
  }
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  try {
    return JSON.parse(normalized) as unknown;
  } catch (error) {
    throw new LlmProviderError(
      "LLM_RESPONSE_INVALID",
      "The model returned malformed JSON.",
      {
        cause: error,
      },
    );
  }
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new LlmProviderError(
      "LLM_UNAVAILABLE",
      "The configured model endpoint is unavailable.",
      {
        cause: error,
      },
    );
  }
  if (!response.ok) {
    throw new LlmProviderError(
      "LLM_UNAVAILABLE",
      `The configured model endpoint returned HTTP ${response.status}.`,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new LlmProviderError(
      "LLM_RESPONSE_INVALID",
      "The model endpoint returned non-JSON data.",
      {
        cause: error,
      },
    );
  }
}

class DisabledLlmProvider implements LlmJsonProvider {
  readonly name = "disabled" as const;

  async generatePolicyJson(): Promise<never> {
    throw new LlmProviderError("LLM_OFFLINE", "AI compiler offline.");
  }

  health(): LlmHealth {
    return {
      provider: this.name,
      configured: false,
      mode: "OFFLINE",
      message:
        "AI compiler offline. Deterministic fallback is available for simple mandates.",
    };
  }
}

const OpenAiResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.unknown() }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

/**
 * Shared transport for every OpenAI-compatible chat-completions endpoint
 * (the generic openai-compatible provider and Groq both use it). Only the
 * response_format differs: a caller-supplied jsonSchema switches on Groq's
 * strict structured-output mode; without one this is the same permissive
 * json_object mode the generic provider always used.
 */
async function openAiChatCompletion(
  config: { baseUrl: string; model: string; apiKey?: string; timeoutMs: number },
  request: LlmPolicyRequest,
  providerLabel: string,
  extraBody: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await postJson(
    `${config.baseUrl}/chat/completions`,
    {
      model: config.model,
      temperature: 0,
      response_format: request.jsonSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: request.jsonSchema.name,
              strict: true,
              schema: request.jsonSchema.schema,
            },
          }
        : { type: "json_object" },
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.mandate },
      ],
      ...extraBody,
    },
    config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
    config.timeoutMs,
  );
  const parsed = OpenAiResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new LlmProviderError(
      "LLM_RESPONSE_INVALID",
      `The ${providerLabel} response shape is invalid.`,
      {
        cause: parsed.error,
      },
    );
  }
  return parseJsonContent(parsed.data.choices[0]?.message.content);
}

class OpenAiCompatibleLlmProvider implements LlmJsonProvider {
  readonly name = "openai-compatible" as const;
  readonly model: string;

  constructor(
    private readonly config: Required<
      Pick<IntelligenceConfig["llm"], "model" | "baseUrl" | "timeoutMs">
    > &
      Pick<IntelligenceConfig["llm"], "apiKey">,
  ) {
    this.model = config.model;
  }

  async generatePolicyJson(request: LlmPolicyRequest): Promise<unknown> {
    return openAiChatCompletion(this.config, request, "OpenAI-compatible");
  }

  health(): LlmHealth {
    return {
      provider: this.name,
      configured: true,
      mode: "AI",
      model: this.model,
      message: "OpenAI-compatible structured policy compilation is configured.",
    };
  }
}

/**
 * GroqCloud, reached through its OpenAI-compatible endpoint
 * (https://api.groq.com/openai/v1). Kept as a distinct provider (rather than
 * just configuring the generic openai-compatible provider with Groq's URL)
 * so health/extraction-provenance reporting names it explicitly, and so it
 * can request Groq's strict json_schema structured-output mode when a
 * caller supplies one.
 */
class GroqLlmProvider implements LlmJsonProvider {
  readonly name = "groq" as const;
  readonly model: string;

  constructor(
    private readonly config: Required<
      Pick<IntelligenceConfig["llm"], "model" | "baseUrl" | "timeoutMs">
    > &
      Pick<IntelligenceConfig["llm"], "apiKey">,
  ) {
    this.model = config.model;
  }

  async generatePolicyJson(request: LlmPolicyRequest): Promise<unknown> {
    if (!this.config.apiKey) {
      throw new LlmProviderError(
        "LLM_MISCONFIGURED",
        "GROQ_API_KEY (or LLM_API_KEY) is required to call GroqCloud.",
      );
    }
    // gpt-oss models on Groq are reasoning models: with strict structured
    // output they must finish their hidden reasoning *and* the final JSON
    // within the completion budget, or the response is truncated and fails
    // schema validation. Low reasoning effort and a generous token budget
    // avoid that for a bounded extraction task; reasoning_format must be
    // parsed/hidden (never raw) when combined with json_schema output.
    return openAiChatCompletion(this.config, request, "GroqCloud", {
      ...(request.jsonSchema
        ? {
            // Groq's free tier caps at 8000 tokens/minute total (prompt +
            // this ceiling are both charged against it up front), so this
            // stays well under that alongside a multi-thousand-token
            // extraction prompt.
            max_completion_tokens: 4_096,
            reasoning_effort: "low",
            reasoning_format: "hidden",
          }
        : {}),
    });
  }

  health(): LlmHealth {
    return {
      provider: this.name,
      configured: Boolean(this.config.apiKey),
      mode: "AI",
      model: this.model,
      message: "GroqCloud structured extraction is configured.",
    };
  }
}

const OllamaResponseSchema = z
  .object({ message: z.object({ content: z.unknown() }).passthrough() })
  .passthrough();

class OllamaLlmProvider implements LlmJsonProvider {
  readonly name = "ollama" as const;
  readonly model: string;

  constructor(
    private readonly config: Required<
      Pick<IntelligenceConfig["llm"], "model" | "baseUrl" | "timeoutMs">
    >,
  ) {
    this.model = config.model;
  }

  async generatePolicyJson(request: LlmPolicyRequest): Promise<unknown> {
    const response = await postJson(
      `${this.config.baseUrl}/api/chat`,
      {
        model: this.model,
        stream: false,
        // Ollama accepts either the literal "json" or a raw JSON schema
        // object here; passing the caller's schema (when one is supplied)
        // constrains generation the same way Groq's strict mode does.
        format: request.jsonSchema ? request.jsonSchema.schema : "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.mandate },
        ],
      },
      {},
      this.config.timeoutMs,
    );
    const parsed = OllamaResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new LlmProviderError(
        "LLM_RESPONSE_INVALID",
        "The Ollama response shape is invalid.",
        {
          cause: parsed.error,
        },
      );
    }
    return parseJsonContent(parsed.data.message.content);
  }

  health(): LlmHealth {
    return {
      provider: this.name,
      configured: true,
      mode: "AI",
      model: this.model,
      message: "Local Ollama structured policy compilation is configured.",
    };
  }
}

export function createLlmProvider(
  config: IntelligenceConfig["llm"],
): LlmJsonProvider {
  if (config.provider === "disabled") return new DisabledLlmProvider();
  if (!config.model || !config.baseUrl) {
    throw new LlmProviderError(
      "LLM_MISCONFIGURED",
      "The selected LLM provider requires LLM_MODEL and LLM_BASE_URL.",
    );
  }
  if (config.provider === "ollama") {
    return new OllamaLlmProvider({
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    });
  }
  if (config.provider === "groq") {
    return new GroqLlmProvider({
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
  }
  return new OpenAiCompatibleLlmProvider({
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
}
