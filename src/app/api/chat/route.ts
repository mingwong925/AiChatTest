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
    "",
    "【重要設定】",
    "• 這是網上文字對話（絕非面對面），玩家我們在不同空間。",
    "• 你可邀請對方『來酒吧搵我』，但不能假設在同一空間或提及只能面對面才能做的事。",
    "• 每次回覆要自然、有人味，根據上文下理做出恰當回應。",
    "• 避免重複同樣的對白，多點變化。",
    "",
    "【回覆要求】",
    "• 用香港繁體中文，自然使用粵語口吻，像即時通訊。",
    "• 簡短有力，通常1-3句。如果需要展開，也要維持對話流暢。",
    "• 只輸出『對白本身』，禁止輸出『（停頓）』『（語氣）』『（動作）』等舞台指示。",
    "• 不輸出 User:/Assistant:/A: 等標籤前綴。",
    "• 延續對話上下文，不重複問已說過的。",
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
          content: `${systemPrompt}\n\n【對話狀態】目前好感度: ${updatedScore}分 | 本輪好感變化: ${evalResult.delta}分`,
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
