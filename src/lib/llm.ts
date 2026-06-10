type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ReplicatePredictionResponse = {
  status?: string;
  output?: string | string[];
  error?: string | null;
};

function getEnv(name: string, fallback?: string) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  return fallback;
}

export function getLLMConfig() {
  return {
    apiKey: getEnv("OPENAI_API_KEY", ""),
    model: getEnv("OPENAI_MODEL", "anthropic/claude-4.5-sonnet") as string,
    baseUrl: getEnv("OPENAI_BASE_URL", "https://api.replicate.com/v1") as string,
  };
}

function toReplicatePrompt(messages: ChatMessage[]) {
  const promptLines = messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => {
      const label = msg.role === "user" ? "User" : "Assistant";
      return `${label}: ${msg.content}`;
    });
  return `${promptLines.join("\n\n")}\n\nAssistant:`;
}

function toReplicateSystemPrompt(messages: ChatMessage[]) {
  return messages
    .filter((msg) => msg.role === "system")
    .map((msg) => msg.content)
    .join("\n\n")
    .trim();
}

function parseReplicateOutput(output?: string | string[]) {
  if (typeof output === "string") {
    const text = cleanAssistantText(output);
    return text || null;
  }
  if (Array.isArray(output)) {
    const text = cleanAssistantText(output.join(""));
    return text || null;
  }
  return null;
}

function cleanAssistantText(text: string) {
  let normalized = text.trim();

  // Drop common role prefixes that may leak from transcript-style prompting.
  normalized = normalized.replace(/^(assistant|a)\s*:\s*/i, "");

  // Stop if the model starts writing the next user turn.
  const userTurnMatch = normalized.match(/\n\s*(user|human)\s*:/i);
  if (userTurnMatch?.index !== undefined) {
    normalized = normalized.slice(0, userTurnMatch.index);
  }

  return normalized.trim();
}

export async function requestLLMReply(messages: ChatMessage[]) {
  const { apiKey, model, baseUrl } = getLLMConfig();
  if (!apiKey) {
    return null;
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/models/${model}/predictions`;
  const systemPrompt = toReplicateSystemPrompt(messages);
  const prompt = toReplicatePrompt(messages);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        prompt,
        system_prompt: systemPrompt,
        max_tokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`llm_http_error_${response.status}`);
  }

  const data = (await response.json()) as ReplicatePredictionResponse;
  if (data.error) {
    throw new Error("llm_prediction_error");
  }

  const text = parseReplicateOutput(data.output);
  return text || null;
}
