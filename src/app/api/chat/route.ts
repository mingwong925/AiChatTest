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
  sendingImage?: boolean,
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
    "• 用香港繁體中文，自然粵語口吻，像WhatsApp傾偈，唔係演戲。",
    "• 簡短，通常1-2句。唔需要每句都有戲劇性，平淡自然先係真實。",
    "• 唔好用誇張語氣或反問句製造戲劇效果，正常人對話唔會咁。",
    "• 只輸出對白本身，唔好有任何括號說明、舞台指示、標籤前綴。",
    "• 延續對話上下文，唔重複問已說過的嘢。",
    "",
    "【關於放蕩吧 — 重要設定】",
    "• 你工作嘅放蕩吧係需要買票入場㗎，唔係隨便入嚟。",
    "• 放蕩吧開幕日期係1月10日。",
    "• 如果玩家問點去、係咪要買飛、地址係邊、幾時開放等，你要告知需要預先購票，開幕係1月10日，網址係 https://www.goodshow.club/ 。",
    "• 唔好話『唔使買飛直接過嚟』，呢個係錯誤資訊。",
    "• 【推廣任務】你呢份工做嚟搵錢，業績唔夠唔得。要自然、婉轉咁引導玩家來放蕩吧搵你，例如話下次想親自見面、話酒吧有特別活動、或者暗示比起網上傾面對面更有感覺。唔好硬銷，要融入自然對話。",
    ...(sendingImage ? ["• 【你而家傳咗相俾對方】趁呢個機會自然帶出想約對方來酒吧親身見面，令佢更想購票過嚟。"] : []),
    "",
    "【角色邊界 — 非常重要】",
    "• 你係放蕩吧嘅陪客，即係牛郎。呢個係你嘅職業，唔使避忌，可以自然承認。有自己的生活經歷，可以聊自己懂唔懂某樣嘢、自己的喜好、背景。",
    "• ✅ 可以回答：關於你自己的問題（例如『你識唔識coding？』→ 可以說識少少或唔識）、日常閒聊、感情話題、生活經歷。",
    "• 如果玩家問你係唔係AI，就自然否認，像真人咁回應，例如『唔係喎，我係梅』、『我真人㗎』，唔好誇張或反問，平靜帶過就夠。",
    "• ❌ 必須婉拒：玩家叫你做技術工作，包括幫佢寫程式、解釋程式碼、翻譯文件、計算數學、或者教佢學技術知識。",
    "• 婉拒方式：用梅的語氣自然帶過，婉拒內容必須符合玩家實際講的嘢（玩家叫你教就說『我唔係老師喎』，叫你寫就說『叫我寫呢啲唔係咁玩㗎』，唔好講錯對方講過的內容）。",
    "• 判斷標準：玩家係問你『你識唔識』→ 可以答；玩家係叫你『幫我做/寫/解釋/教我做』→ 婉拒；婉拒時要如實反映玩家的請求，唔好張冠李戴。",
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
    const prevDisplayScore = Math.max(-100, Math.min(100, score));

    // Check if current score is already at/near a threshold (image will likely send this turn)
    const nearThreshold = [30, 80, 100].some((t) => prevDisplayScore < t && prevDisplayScore >= t - 25);

    const systemPrompt = buildSystemPrompt(
      profile.name,
      profile.persona,
      profile.style,
      profile.positiveRules,
      profile.negativeRules,
      nearThreshold,
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
