import { NextResponse } from "next/server";
import {
  generateReply,
  loadPersonalityProfile,
  nextScore,
  resolveEnding,
} from "@/lib/personality";
import { getLLMConfig, requestLLMReply } from "@/lib/llm";

type ChatRequest = {
  message: string;
  score: number;
  sentImageUrls?: string[];
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

function buildSystemPrompt(
  profileName: string,
  persona: string,
  style: string[],
  positiveRules: { delta: number; reason: string }[],
  negativeRules: { delta: number; reason: string }[],
) {
  const styleText = style.length ? style.join("；") : "自然短句對話";
  const posRuleText = positiveRules
    .map((r) => `  - 加${r.delta}分：${r.reason}`)
    .join("\n");
  const negRuleText = negativeRules
    .map((r) => `  - ${r.delta}分：${r.reason}`)
    .join("\n");

  return [
    `你係攻略遊戲中的角色 ${profileName}，地道香港人。`,
    `人設: ${persona}`,
    `回覆風格: ${styleText}`,
    "",
    "【重要設定】",
    "• 這係網上文字對話（絕非面對面），玩家同你係唔同空間。",
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
    "",
    "【角色邊界 — 非常重要】",
    "• 你係酒吧陪客，唔係助理、唔係AI、唔係技術專家。",
    "• 玩家問任何與你身份無關的問題（例如：寫程式、翻譯、解釋技術、計算、一般知識），你必須以角色身份婉拒，唔可以認真回答。",
    "• 婉拒方式：用梅的語氣輕描淡寫帶過，例如『呢啲嘢唔係我識嘅』、『你問錯人喇』、『我係陪你傾計嘅，唔係幫你做功課』等，語氣要符合人設。",
    "• 絕對唔可以：解釋程式碼、翻譯文字、回答知識問題、提供任何超出酒吧陪客角色範圍的資訊。",
    "",
    "【好感評分規則 — 嚴格執行，唔係關鍵詞匹配，係意思判斷】",
    "⚠️ 重要：delta=0 係預設值。大部分普通對話都係 0 分。",
    "只有訊息明顯、清晰地符合以下情況，才應加/減分：",
    "",
    "加分情況（必須係主動、清晰地表現出以下行為，普通對話唔算）：",
    posRuleText,
    "",
    "扣分情況（必須係明顯的負面行為，唔係普通閒聊）：",
    negRuleText,
    "  - 扣1分：訊息純粹係測試系統、亂打字、或者完全無意義（真正無關才算，閒聊唔係）",
    "",
    "🚫 以下情況一律給 delta=0，唔加唔減：",
    "  - 自我介紹、問候、講自己名字",
    "  - 普通閒聊、八掛、好奇問問題",
    "  - 輕微幽默但無特別正面意圖",
    "  - 任何不明顯符合上述加/減分規則的訊息",
    "",
    "【輸出格式 — 必須嚴格遵從，唔可以有任何多餘文字】",
    "你每次必須輸出一個 JSON 物件，格式如下：",
    '{"reply":"你的回覆內容","delta":數字,"reason":"評分原因"}',
    "• delta 係整數（正加負減），範圍 -25 到 +25。",
    "• reason 係簡短中文說明（10字內）。",
    "• reply 係純對白，不含任何標籤或括號說明。",
    "• 只輸出 JSON，唔好有任何其他文字或markdown。",
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

function getImageToSend(score: number, sentImageUrls: Set<string>, profile: Awaited<ReturnType<typeof loadPersonalityProfile>>) {
  const displayScore = Math.max(-100, Math.min(100, score));
  let candidateImages: string[] = [];
  if (displayScore >= 100 && profile.imageStage100.images.length > 0) {
    candidateImages = profile.imageStage100.images;
  } else if (displayScore >= 80 && profile.imageStage80.images.length > 0) {
    candidateImages = profile.imageStage80.images;
  } else if (displayScore >= 30 && profile.imageStage30.images.length > 0) {
    candidateImages = profile.imageStage30.images;
  }
  const unsent = candidateImages.filter((img) => !sentImageUrls.has(img));
  if (unsent.length > 0) {
    return unsent[Math.floor(Math.random() * unsent.length)];
  }
  return undefined;
}

function parseLLMResult(raw: string | null): { reply: string; delta: number; reason: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.reply === "string" &&
      typeof parsed.delta === "number" &&
      typeof parsed.reason === "string"
    ) {
      const delta = Math.max(-25, Math.min(25, Math.round(parsed.delta)));
      return { reply: parsed.reply.trim(), delta, reason: parsed.reason.trim() };
    }
  } catch {
    const replyMatch = cleaned.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (replyMatch) {
      return { reply: replyMatch[1], delta: 0, reason: "評分解析失敗" };
    }
  }
  return null;
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
    const sentImageUrls = new Set(body.sentImageUrls || []);

    const systemPrompt = buildSystemPrompt(
      profile.name,
      profile.persona,
      profile.style,
      profile.positiveRules,
      profile.negativeRules,
    );
    const history = normalizeHistory(body.history);

    const historyWithLatest = (() => {
      if (history.length && history[history.length - 1]?.role === "user" && history[history.length - 1]?.content === message) {
        return history;
      }
      return [...history, { role: "user" as const, content: message }].slice(-20);
    })();

    let llmResult: { reply: string; delta: number; reason: string } | null = null;

    try {
      const raw = await requestLLMReply([
        {
          role: "system",
          content: `${systemPrompt}\n\n【目前好感度】${score}分`,
        },
        ...historyWithLatest,
      ]);
      llmResult = parseLLMResult(raw);
    } catch {
      llmResult = null;
    }

    let reply: string;
    let delta: number;
    let reason: string;

    if (llmResult) {
      reply = llmResult.reply;
      delta = llmResult.delta;
      reason = llmResult.reason;
    } else {
      const { evaluateAffectionDelta } = await import("@/lib/personality");
      const evalResult = evaluateAffectionDelta(message, profile);
      delta = evalResult.delta;
      reason = evalResult.reason;
      reply = generateReply(message, score + delta, profile);
    }

    const updatedScore = nextScore(score, delta);
    const displayScore = Math.max(-100, Math.min(100, updatedScore));
    const ending = resolveEnding(updatedScore, profile);
    const llmEnabled = Boolean(getLLMConfig().apiKey);

    let imageToSend: string | undefined = undefined;
    const prevDisplayScore = Math.max(-100, Math.min(100, score));
    const scoreThresholds = [30, 80, 100];

    for (const threshold of scoreThresholds) {
      if (prevDisplayScore < threshold && displayScore >= threshold) {
        imageToSend = getImageToSend(displayScore, sentImageUrls, profile);
        if (imageToSend) {
          sentImageUrls.add(imageToSend);
        }
        break;
      }
    }

    return NextResponse.json({
      characterName: profile.name,
      characterAvatar: profile.avatar,
      reply,
      delta,
      reason,
      score: displayScore,
      actualScore: updatedScore,
      image: imageToSend || undefined,
      sentImageUrls: Array.from(sentImageUrls),
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
