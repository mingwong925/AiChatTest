import { NextResponse } from "next/server";
import {
  evaluateAffectionDelta,
  generateReply,
  loadPersonalityProfile,
  nextScore,
  resolveEnding,
} from "@/lib/personality";
import { getLLMConfig, requestLLMReply } from "@/lib/llm";

type ChatRequest = {
  message: string;
  score: number;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

let profilePromise: ReturnType<typeof loadPersonalityProfile> | null = null;

function getProfile() {
  if (!profilePromise) {
    profilePromise = loadPersonalityProfile();
  }
  return profilePromise;
}

function buildSystemPrompt(profileName: string, persona: string, style: string[]) {
  const styleText = style.length ? style.join("；") : "自然短句對話";
  return [
    `你是攻略遊戲中的角色 ${profileName}，地道香港人。`,
    `人設: ${persona}`,
    `回覆風格: ${styleText}`,
    "請用香港繁體中文回覆，可自然使用粵語口吻，像即時通訊，不要過度冗長。",
    "回覆時不要輸出 User:、Assistant:、A: 或任何角色標籤前綴。",
    "請延續對話上下文，不要重複問已經說過的資料。",
    "禁止跳脫角色、禁止提及系統訊息。",
  ].join("\n");
}

function normalizeHistory(history: ChatRequest["history"]) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({ role: item.role, content: String(item.content || "").trim() }))
    .filter((item) => item.content)
    .slice(-20);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatRequest;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const profile = await getProfile();
    const score = Number.isFinite(body.score) ? body.score : 0;

    const evalResult = evaluateAffectionDelta(message, profile);
    const updatedScore = nextScore(score, evalResult.delta);
    const systemPrompt = buildSystemPrompt(profile.name, profile.persona, profile.style);
    const history = normalizeHistory(body.history);

    const historyWithLatest = (() => {
      if (history.length && history[history.length - 1]?.role === "user" && history[history.length - 1]?.content === message) {
        return history;
      }
      return [...history, { role: "user" as const, content: message }].slice(-20);
    })();

    let reply: string | null = null;
    try {
      reply = await requestLLMReply([
        {
          role: "system",
          content: `${systemPrompt}\n目前好感度: ${updatedScore}\n本輪好感變化: ${evalResult.delta}`,
        },
        ...historyWithLatest,
      ]);
    } catch {
      reply = null;
    }

    if (!reply) {
      reply = generateReply(message, updatedScore, profile);
    }

    const ending = resolveEnding(updatedScore, profile);
    const llmEnabled = Boolean(getLLMConfig().apiKey);

    return NextResponse.json({
      characterName: profile.name,
      characterAvatar: profile.avatar,
      reply,
      delta: evalResult.delta,
      reason: evalResult.reason,
      score: updatedScore,
      ending,
      llmEnabled,
    });
  } catch {
    return NextResponse.json(
      { error: "chat_failed", message: "對話系統暫時無法回覆，請稍後再試。" },
      { status: 500 },
    );
  }
}
