"use client";

import { FormEvent, useMemo, useState } from "react";

type Role = "user" | "ai";

type ChatItem = {
  id: string;
  role: Role;
  text: string;
  time: string;
  delta?: number;
  reason?: string;
  media?: {
    type: "image" | "video";
    url: string;
  };
};

type ChatResponse = {
  characterName: string;
  characterAvatar?: string;
  reply: string;
  delta: number;
  reason: string;
  score: number;
  actualScore: number;
  image?: string;
  sentImageUrls: string[];
  ending: {
    type: "success" | "failure";
    payload: {
      text: string;
      image: string;
      video: string;
    };
  } | null;
};

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const nowLabel = () =>
  new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });

const clamp = (value: number) => Math.max(-100, Math.min(100, value));

export default function Home() {
  const [score, setScore] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState<null | "success" | "failure">(null);
  const [characterName, setCharacterName] = useState("梅");
  const [characterAvatar, setCharacterAvatar] = useState("/mei-avatar.png");
  const [sentImageUrls, setSentImageUrls] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<ChatItem[]>([
    {
      id: crypto.randomUUID(),
      role: "ai",
      text: "你好，歡迎體驗「放蕩吧」嘅一對一線上空間。我係阿梅，今晚我負責聽，你負責講。點稱呼你，等我可以好好記住你？",
      time: nowLabel(),
    },
  ]);

  const meterLeft = useMemo(() => ((score + 100) / 200) * 100, [score]);
  const mood = useMemo(() => {
    if (score >= 70) return "心動";
    if (score >= 20) return "好奇";
    if (score > -20) return "觀望";
    if (score > -70) return "反感";
    return "警戒";
  }, [score]);

  const iconRow = useMemo(() => {
    const level = Math.round((score + 100) / 40);
    return Array.from({ length: 5 }, (_, idx) => (idx < level ? "❤️" : "🤍")).join(" ");
  }, [score]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading || ended) return;

    const userMessage: ChatItem = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      time: nowLabel(),
    };

    setItems((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const mappedHistory: HistoryMessage[] = items
        .filter((item) => item.text && !item.media)
        .map<HistoryMessage>((item) => ({
          role: item.role === "user" ? "user" : "assistant",
          content: item.text,
        }));

      const history: HistoryMessage[] = mappedHistory.slice(-19);
      history.push({ role: "user", content: text });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: text, 
          score, 
          history,
          sentImageUrls: Array.from(sentImageUrls)
        }),
      });

      if (!res.ok) {
        throw new Error("request_failed");
      }

      const data = (await res.json()) as ChatResponse;
      setScore(clamp(data.score));
      setCharacterName(data.characterName || "梅");
      setCharacterAvatar(data.characterAvatar || "/mei-avatar.png");
      setSentImageUrls(new Set(data.sentImageUrls || []));

      const nextItems: ChatItem[] = [
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: data.reply,
          time: nowLabel(),
          delta: data.delta,
          reason: data.reason,
        },
      ];

      // Add image if one was sent
      if (data.image) {
        nextItems.push({
          id: crypto.randomUUID(),
          role: "ai",
          text: "",
          time: nowLabel(),
          media: { type: "image", url: data.image },
        });
      }

      if (data.ending) {
        setEnded(data.ending.type);
        nextItems.push(
          {
            id: crypto.randomUUID(),
            role: "ai",
            text: data.ending.payload.text,
            time: nowLabel(),
          },
          {
            id: crypto.randomUUID(),
            role: "ai",
            text: "",
            time: nowLabel(),
            media: { type: "image", url: data.ending.payload.image },
          },
          {
            id: crypto.randomUUID(),
            role: "ai",
            text: "",
            time: nowLabel(),
            media: { type: "video", url: data.ending.payload.video },
          },
        );
      }

      setItems((prev) => [...prev, ...nextItems]);
    } catch {
      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: "我剛剛訊號不穩，能再說一次嗎？",
          time: nowLabel(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setScore(0);
    setEnded(null);
    setItems([
      {
        id: crypto.randomUUID(),
        role: "ai",
        text: "你好，歡迎體驗「放蕩吧」嘅一對一線上空間。我係阿梅，今晚我負責聽，你負責講。點稱呼你，等我可以好好記住你？",
        time: nowLabel(),
      },
    ]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-2 md:p-4">
      <main className="chat-shell dot-pattern w-full max-w-2xl overflow-hidden" style={{ aspectRatio: "9 / 14" }}>
        <section className="flex h-full flex-col">
          <header className="border-b border-purple-100 bg-purple-50/90 px-4 py-2 md:px-6 md:py-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={characterAvatar}
                  alt={`${characterName} avatar`}
                  className="h-10 w-10 rounded-full border border-purple-200 object-cover shadow-sm"
                />
                <div>
                <h1 className="chat-header-title text-lg font-bold text-purple-900 md:text-xl">*有料呻吟-牛郎攻略（梅）DEMO</h1>
                <p className="text-xs md:text-sm text-purple-700">角色: {characterName}</p>
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700 shadow-sm whitespace-nowrap">
                心情: {mood}
              </div>
            </div>

            <div className="mt-2">
              <div className="mb-0.5 flex items-center justify-between text-xs text-purple-800">
                <span>{iconRow}</span>
                <span>好感度 {score} / 100</span>
              </div>
              <div className="score-track">
                <div className="score-thumb" style={{ left: `${meterLeft}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-purple-700/80">
                <span>-100</span>
                <span>0</span>
                <span>+100</span>
              </div>
            </div>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto bg-[#faf6ff]/70 px-3 py-2 md:px-4 md:py-3">
            {items.map((item) => {
              const align = item.role === "user" ? "justify-end" : "justify-start";
              const bubbleClass = item.role === "user" ? "bubble-self" : "bubble-ai";

              return (
                <div key={item.id} className={`flex ${align}`}>
                  {item.role === "ai" && (
                    <img
                      src={characterAvatar}
                      alt={`${characterName} avatar`}
                      className="mr-2 mt-1 h-7 w-7 shrink-0 rounded-full border border-emerald-200 object-cover"
                    />
                  )}
                  <div className={`bubble ${bubbleClass}`}>
                    {item.media?.type === "image" && (
                      <img src={item.media.url} alt="ending" className="h-auto w-48 rounded-xl object-cover" />
                    )}
                    {item.media?.type === "video" && (
                      <video className="w-48 rounded-xl" controls preload="none">
                        <source src={item.media.url} type="video/mp4" />
                      </video>
                    )}
                    {item.text && <p className="text-sm text-purple-950">{item.text}</p>}

                    <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-purple-800/70">
                      {typeof item.delta === "number" && (
                        <span className={item.delta >= 0 ? "text-purple-700" : "text-rose-600"}>
                          {item.delta > 0 ? `+${item.delta}` : item.delta}
                        </span>
                      )}
                      <span>{item.time}</span>
                    </div>
                    {item.reason && <p className="mt-0.5 text-[10px] text-purple-700/80">{item.reason}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="border-t border-purple-100 bg-white px-3 py-2 md:px-4 flex-shrink-0">
            {ended && (
              <div className="mb-2 rounded-xl border border-emerald-200 bg-purple-50 px-3 py-1.5 text-xs md:text-sm text-purple-800">
                {ended === "success"
                  ? "你已達成 +100 好感度，成功結局已觸發。"
                  : "你已達成 -100 好感度，失敗結局已觸發。"}
              </div>
            )}
            <form className="flex gap-2" onSubmit={sendMessage}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="min-w-0 flex-1 rounded-full border border-emerald-200 px-4 py-2 text-sm outline-none ring-purple-400 transition focus:ring-2"
                placeholder={ended ? "結局已達成，請按重新開始" : "輸入訊息，試著攻略他..."}
                disabled={loading || Boolean(ended)}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || Boolean(ended)}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? "傳送中..." : "送出"}
              </button>
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-emerald-200 px-3 py-2 text-sm text-purple-800 transition hover:bg-purple-50 whitespace-nowrap"
              >
                重開
              </button>
            </form>
          </footer>
        </section>
      </main>
    </div>
  );
}
