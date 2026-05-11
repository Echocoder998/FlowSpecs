type StructuredResponseArgs = {
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  maxOutputTokens?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
  timeoutMs?: number;
};

function extractOutputText(response: any) {
  if (typeof response.output_text === "string") return response.output_text;

  const parts: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.refusal === "string") {
        throw new Error(content.refusal);
      }
    }
  }

  return parts.join("");
}

export async function createStructuredResponse<T>({
  name,
  schema,
  system,
  user,
  maxOutputTokens = 12000,
  reasoningEffort = "low",
  timeoutMs = 110000
}: StructuredResponseArgs): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        reasoning: {
          effort: process.env.OPENAI_REASONING_EFFORT || reasoningEffort
        },
        input: [
          {
            role: "system",
            content: system
          },
          {
            role: "user",
            content: user
          }
        ],
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema
          }
        }
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        payload?.error?.message || `OpenAI request failed with HTTP ${response.status}`;
      throw new Error(message);
    }

    const outputText = extractOutputText(payload);
    if (!outputText.trim()) {
      throw new Error("OpenAI returned an empty response.");
    }

    try {
      return JSON.parse(outputText) as T;
    } catch {
      throw new Error("OpenAI returned JSON that could not be parsed.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizeText(input: string, maxChars: number) {
  return input.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").slice(0, maxChars);
}
