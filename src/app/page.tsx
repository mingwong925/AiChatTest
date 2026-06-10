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
        body: JSON.stringify({ message: text, score, history }),
      });

      if (!res.ok) {
        throw new Error("request_failed");
      }

      const data = (await res.json()) as ChatResponse;
      setScore(clamp(data.score));
      setCharacterName(data.characterName || "梅");
      setCharacterAvatar(data.characterAvatar || "/mei-avatar.png");

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
    <div className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <main className="chat-shell dot-pattern w-full max-w-4xl overflow-hidden">
        <section className="flex min-h-[80vh] flex-col">
          <header className="border-b border-emerald-100 bg-emerald-50/90 px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={characterAvatar}
                  alt={`${characterName} avatar`}
                  className="h-11 w-11 rounded-full border border-emerald-200 object-cover shadow-sm"
                />
                <div>
                <h1 className="chat-header-title text-xl font-bold text-emerald-900 md:text-2xl">*有料呻吟-牛郎攻略（梅）DEMO</h1>
                <p className="text-sm text-emerald-700">角色: {characterName}</p>
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                心情: {mood}
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-emerald-800">
                <span>{iconRow}</span>
                <span>好感度 {score} / 100</span>
              </div>
              <div className="score-track">
                <div className="score-thumb" style={{ left: `${meterLeft}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-emerald-700/80">
                <span>-100</span>
                <span>0</span>
                <span>+100</span>
              </div>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#e9f8ee]/70 px-3 py-4 md:px-5">
            {items.map((item) => {
              const align = item.role === "user" ? "justify-end" : "justify-start";
              const bubbleClass = item.role === "user" ? "bubble-self" : "bubble-ai";

              return (
                <div key={item.id} className={`flex ${align}`}>
                  {item.role === "ai" && (
                    <img
                      src={characterAvatar}
                      alt={`${characterName} avatar`}
                      className="mr-2 mt-1 h-8 w-8 shrink-0 rounded-full border border-emerald-200 object-cover"
                    />
                  )}
                  <div className={`bubble ${bubbleClass}`}>
                    {item.media?.type === "image" && (
                      <img src={item.media.url} alt="ending" className="h-auto w-64 rounded-xl object-cover" />
                    )}
                    {item.media?.type === "video" && (
                      <video className="w-64 rounded-xl" controls preload="none">
                        <source src={item.media.url} type="video/mp4" />
                      </video>
                    )}
                    {item.text && <p className="text-[15px] text-emerald-950">{item.text}</p>}

                    <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-emerald-800/70">
                      {typeof item.delta === "number" && (
                        <span className={item.delta >= 0 ? "text-emerald-700" : "text-rose-600"}>
                          {item.delta > 0 ? `+${item.delta}` : item.delta}
                        </span>
                      )}
                      <span>{item.time}</span>
                    </div>
                    {item.reason && <p className="mt-1 text-[11px] text-emerald-700/80">{item.reason}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="border-t border-emerald-100 bg-white px-3 py-3 md:px-5">
            {ended && (
              <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {ended === "success"
                  ? "你已達成 +100 好感度，成功結局已觸發。"
                  : "你已達成 -100 好感度，失敗結局已觸發。"}
              </div>
            )}
            <form className="flex gap-2" onSubmit={sendMessage}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="min-w-0 flex-1 rounded-full border border-emerald-200 px-4 py-3 text-sm outline-none ring-emerald-400 transition focus:ring-2"
                placeholder={ended ? "結局已達成，請按重新開始" : "輸入訊息，試著攻略他..."}
                disabled={loading || Boolean(ended)}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || Boolean(ended)}
                className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "傳送中..." : "送出"}
              </button>
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-emerald-200 px-4 py-3 text-sm text-emerald-800 transition hover:bg-emerald-50"
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
