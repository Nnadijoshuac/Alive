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
    const response = await postJson(
      `${this.config.baseUrl}/chat/completions`,
      {
        model: this.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.mandate },
        ],
      },
      this.config.apiKey
        ? { authorization: `Bearer ${this.config.apiKey}` }
        : {},
      this.config.timeoutMs,
    );
    const parsed = OpenAiResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new LlmProviderError(
        "LLM_RESPONSE_INVALID",
        "The OpenAI-compatible response shape is invalid.",
        {
          cause: parsed.error,
        },
      );
    }
    return parseJsonContent(parsed.data.choices[0]?.message.content);
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
        format: "json",
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
  return new OpenAiCompatibleLlmProvider({
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
}
