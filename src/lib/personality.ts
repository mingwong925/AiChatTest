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

  let section = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      section = line.replace("## ", "").trim();
      continue;
    }

    if (line.startsWith("名稱:")) {
      name = line.replace("名稱:", "").trim();
      continue;
    }

    if (line.startsWith("頭像:")) {
      avatar = line.replace("頭像:", "").trim() || avatar;
      continue;
    }

    if (line.startsWith("身份:")) {
      persona = line.replace("身份:", "").trim();
      continue;
    }

    if (section === "回覆風格" && line.startsWith("- ")) {
      style.push(line.replace(/^-\s*/, "").trim());
      continue;
    }

    const ruleMatch = line.match(/^([+-]\d+)\s*:\s*(.+?)\s*\|\s*(.+)$/);
    if (ruleMatch) {
      const delta = Number(ruleMatch[1]);
      const keywords = ruleMatch[2].split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
      const reason = ruleMatch[3].trim();
      const rule: Rule = { delta, keywords, reason };
      if (delta >= 0) positiveRules.push(rule);
      else negativeRules.push(rule);
      continue;
    }

    if (section === "結局_成功") {
      fillEndingField(successEnding, line);
    }

    if (section === "結局_失敗") {
      fillEndingField(failureEnding, line);
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
  };
}

function fillEndingField(target: EndingPayload, line: string) {
  const [key, ...rest] = line.split(":");
  const value = rest.join(":").trim();
  if (!value) return;
  if (key === "TEXT") target.text = value;
  if (key === "IMAGE") target.image = value;
  if (key === "VIDEO") target.video = value;
}

export function evaluateAffectionDelta(message: string, profile: PersonalityProfile) {
  const text = message.toLowerCase();

  let delta = 0;
  const reasons: string[] = [];

  for (const rule of [...profile.positiveRules, ...profile.negativeRules]) {
    const hit = rule.keywords.some((keyword) => keyword && text.includes(keyword));
    if (hit) {
      delta += rule.delta;
      reasons.push(rule.reason);
    }
  }

  // 每輪分數變化限制，避免一次命中過多關鍵詞造成跳分過大
  delta = clamp(delta, -25, 25);

  if (delta === 0) {
    if (message.length >= 18) {
      delta = 2;
      reasons.push("有認真回應，投入感提升");
    } else {
      delta = -1;
      reasons.push("訊息偏短，互動感略降");
    }
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
  const msg = message.trim();

  if (score <= -60) {
    return `我先說清楚，${profile.name}不太能接受這樣的互動。你如果願意尊重一點，我們再聊。`;
  }

  if (score >= 70) {
    return `看到你這樣說我其實滿開心的。${msg ? `關於「${msg.slice(0, 14)}」我想再多聽你一點。` : ""}`;
  }

  if (msg.includes("今天") || msg.includes("空") || msg.includes("有空")) {
    return "今天下午有空一小段，你想聊哪個主題？";
  }

  if (msg.includes("你") && msg.includes("喜歡")) {
    return "我喜歡真誠、舒服的節奏，不用急著表現，慢慢聊就好。";
  }

  return "嗯，我有在聽。你可以再說具體一點，我比較容易回你真心話。";
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
