import { readFile } from "node:fs/promises";
import path from "node:path";

export type Rule = {
  delta: number;
  keywords: string[];
  reason: string;
};

export type EndingPayload = {
  text: string;
  image: string;
  video: string;
  buttonText?: string;
  buttonUrl?: string;
};

export type ImageStagePayload = {
  images: string[];
};

export type PersonalityProfile = {
  name: string;
  avatar: string;
  persona: string;
  style: string[];
  positiveRules: Rule[];
  negativeRules: Rule[];
  successEnding: EndingPayload;
  failureEnding: EndingPayload;
  imageStage30: ImageStagePayload;
  imageStage80: ImageStagePayload;
  imageStage100: ImageStagePayload;
  sentImageUrls: Set<string>; // Track already sent images
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export async function loadPersonalityProfile(): Promise<PersonalityProfile> {
  const filePath = path.join(process.cwd(), "data", "梅的角色.md");
  const markdown = await readFile(filePath, "utf8");
  return parsePersonalityMarkdown(markdown);
}

function parsePersonalityMarkdown(markdown: string): PersonalityProfile {
  const lines = markdown.split(/\r?\n/);

  let name = "梅";
  let avatar = "/mei-avatar.png";
  let persona = "香港本地人，語氣平實直接，重視尊重與真誠。";
  const style: string[] = [];
  const positiveRules: Rule[] = [];
  const negativeRules: Rule[] = [];
  const successEnding: EndingPayload = { text: "", image: "", video: "" };
  const failureEnding: EndingPayload = { text: "", image: "", video: "" };
  const imageStage30: ImageStagePayload = { images: [] };
  const imageStage80: ImageStagePayload = { images: [] };
  const imageStage100: ImageStagePayload = { images: [] };

  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      continue; // Skip main title
    }

    if (trimmed.startsWith("名稱:")) {
      name = trimmed.replace("名稱:", "").trim();
      continue;
    }

    if (trimmed.startsWith("頭像:")) {
      avatar = trimmed.replace("頭像:", "").trim();
      continue;
    }

    if (trimmed.startsWith("身份:")) {
      persona = trimmed.replace("身份:", "").trim();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      section = trimmed.replace("## ", "").trim();
      continue;
    }

    if (section === "回覆風格" && trimmed.startsWith("- ")) {
      style.push(trimmed.replace("- ", "").trim());
      continue;
    }

    if (section === "好感加分規則" && /^\+\d+:/.test(trimmed)) {
      const [header, ...rest] = trimmed.split("|");
      const [scoreStr, ...keywords] = header.split(":");
      const delta = parseInt(scoreStr.trim(), 10);
      const reason = rest.join("|").trim();
      const keywordList = keywords[0]?.split(",").map((k) => k.trim()) || [];
      const rule: Rule = { delta, keywords: keywordList, reason };
      positiveRules.push(rule);
      continue;
    }

    if (section === "好感扣分規則" && /^-\d+:/.test(trimmed)) {
      const [header, ...rest] = trimmed.split("|");
      const [scoreStr, ...keywords] = header.split(":");
      const delta = parseInt(scoreStr.trim(), 10);
      const reason = rest.join("|").trim();
      const keywordList = keywords[0]?.split(",").map((k) => k.trim()) || [];
      const rule: Rule = { delta, keywords: keywordList, reason };
      negativeRules.push(rule);
      continue;
    }

    if (section === "結局_成功") {
      fillEndingField(successEnding, line);
    }

    if (section === "結局_失敗") {
      fillEndingField(failureEnding, line);
    }

    if (section === "圖片階段_好感15" && (line.startsWith("http") || line.startsWith("/"))) {
      imageStage30.images.push(line);
    }

    if (section === "圖片階段_好感80" && (line.startsWith("http") || line.startsWith("/"))) {
      imageStage80.images.push(line);
    }

    if (section === "圖片階段_好感100" && (line.startsWith("http") || line.startsWith("/"))) {
      imageStage100.images.push(line);
    }
  }

  return {
    name,
    avatar,
    persona,
    style,
    positiveRules,
    negativeRules,
    successEnding,
    failureEnding,
    imageStage30,
    imageStage80,
    imageStage100,
    sentImageUrls: new Set(),
  };
}

function fillEndingField(target: EndingPayload, line: string) {
  const [key, ...rest] = line.split(":");
  const value = rest.join(":").trim();
  if (!value) return;
  if (key === "TEXT") target.text = value;
  if (key === "IMAGE") target.image = value;
  if (key === "VIDEO") target.video = value;
  if (key === "BUTTON_TEXT") target.buttonText = value;
  if (key === "BUTTON_URL") target.buttonUrl = value;
}

export function evaluateAffectionDelta(message: string, profile: PersonalityProfile) {
  const text = message.toLowerCase();
  const profanityPattern = /(屌你|屌|仆街|冚家鏟|on9|撚|鳩|痴線)/i;
  const semanticRules: Rule[] = [
    {
      delta: 12,
      keywords: [],
      reason: "有禮貌，願意平等交流",
    },
    {
      delta: 14,
      keywords: [],
      reason: "願意建立真實連結",
    },
    {
      delta: 10,
      keywords: [],
      reason: "令佢覺得被接住",
    },
    {
      delta: 8,
      keywords: [],
      reason: "氣氛舒服，冇攻擊性",
    },
    {
      delta: 5,
      keywords: [],
      reason: "簡單讚賞，令人舒服但淺層",
    },
    {
      delta: -14,
      keywords: [],
      reason: "命令語氣觸發反感",
    },
    {
      delta: -18,
      keywords: [],
      reason: "人身攻擊造成強烈防衛",
    },
    {
      delta: -12,
      keywords: [],
      reason: "情緒勒索令人窒息",
    },
    {
      delta: -8,
      keywords: [],
      reason: "持續敷衍會降低投入",
    },
  ];

  const semanticPatterns: RegExp[] = [
    /(唔該|麻煩|拜託|多謝|thanks|thx|請問|可唔可以|可以嗎|方便嗎|不好意思|勞煩)/i,
    /(明白|理解|體諒|感受|辛苦你|想了解|聽你|願意聽|可以講多啲|我在乎|真心|坦白|誠懇)/i,
    /(支持你|陪你|我喺度|一齊|撐你|信你|唔使驚|同你面對|陪住你)/i,
    /(哈哈|笑死|有趣|輕鬆|放鬆|chill|玩笑|搞笑)/i,
    /(快啲|快d|即刻|馬上|照我講|聽我講|你應該|你要|立刻|跟住做)/i,
    /(廢物|垃圾|白痴|無用|低能|弱智|死蠢|屎忽)/i,
    /(你欠我|不回就算|唔覆就|你唔可以咁|你一定要|你令我好失望|如果你唔.*我就)/i,
    /(隨便|算啦|是但|whatever|冇所謂|求其)/i,
    /(讚|讚好|好正|你好叻|厲害|我喜歡你|你好)/i,
  ];

  let delta = 0;
  const reasons: string[] = [];

  for (const rule of [...profile.positiveRules, ...profile.negativeRules]) {
    const hit = rule.keywords.some((keyword) => keyword && text.includes(keyword));
    if (hit) {
      delta += rule.delta;
      reasons.push(rule.reason);
    }
  }

  // Semantic intent matching: related meaning can also trigger rules,
  // even if the exact configured keywords are not present.
  semanticPatterns.forEach((pattern, index) => {
    const semanticRule = semanticRules[index];
    if (!semanticRule) return;
    if (pattern.test(text) && !reasons.includes(semanticRule.reason)) {
      delta += semanticRule.delta;
      reasons.push(semanticRule.reason);
    }
  });

  // Fallback penalty for profanity to ensure abusive wording always decreases affection.
  if (!reasons.length && profanityPattern.test(text)) {
    delta -= 16;
    reasons.push("粗口或侮辱語氣令對話氛圍惡化");
  }

  // 每輪分數變化限制，避免一次命中過多關鍵詞造成跳分過大
  delta = clamp(delta, -25, 25);

  if (reasons.length === 0) {
    reasons.push("未觸及角色喜好或反感話題");
  }

  return {
    delta,
    reason: reasons.join("；"),
  };
}

export function nextScore(currentScore: number, delta: number) {
  return clamp(currentScore + delta, -100, 100);
}

export function generateReply(message: string, score: number, profile: PersonalityProfile) {
  const msg = message.trim().toLowerCase();

  // Only return fallback for extreme affection cases or very short prompts
  if (score <= -70) {
    return `我撐唔住呢樣嘅態度。`;
  }

  if (score >= 85) {
    return `你令我覺得冇咁孤單。今次，我想主動搵你。`;
  }

  // For normal cases, return a general prompt-to-continue to let LLM handle it
  // This shouldn't be reached often if LLM is working properly
  return "嗯，講下去。";
}

export type EndingType = "success" | "failure";

export function resolveEnding(score: number, profile: PersonalityProfile) {
  if (score >= 100) {
    return {
      type: "success" as EndingType,
      payload: profile.successEnding,
    };
  }

  if (score <= -100) {
    return {
      type: "failure" as EndingType,
      payload: profile.failureEnding,
    };
  }

  return null;
}
