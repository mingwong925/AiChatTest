"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  button?: {
    text: string;
    url: string;
  };
};

type HeartParticle = {
  id: string;
  left: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
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
  imageCaption?: string;
  sentImageUrls: string[];
  ending: {
    type: "success" | "failure";
    payload: {
      text: string;
      image: string;
      video: string;
      buttonText?: string;
      buttonUrl?: string;
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
  const [heartParticles, setHeartParticles] = useState<HeartParticle[]>([]);
  const [damageEffectOn, setDamageEffectOn] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const effectTimeoutsRef = useRef<number[]>([]);

  const [items, setItems] = useState<ChatItem[]>([
    {
      id: crypto.randomUUID(),
      role: "ai",
      text: "你好，歡迎體驗「放蕩吧」嘅一對一線上空間。我係阿梅，今晚我負責聽，你負責講。點稱呼你，等我可以好好記住你？",
      time: nowLabel(),
    },
  ]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  useEffect(() => {
    return () => {
      effectTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      effectTimeoutsRef.current = [];
    };
  }, []);

  function registerEffectTimeout(callback: () => void, delay: number) {
    const timeoutId = window.setTimeout(() => {
      callback();
      effectTimeoutsRef.current = effectTimeoutsRef.current.filter((id) => id !== timeoutId);
    }, delay);
    effectTimeoutsRef.current.push(timeoutId);
  }

  function triggerPositiveEffect() {
    const particles: HeartParticle[] = Array.from({ length: 12 }, () => ({
      id: crypto.randomUUID(),
      left: 12 + Math.random() * 76,
      size: 16 + Math.round(Math.random() * 16),
      duration: 850 + Math.round(Math.random() * 500),
      delay: Math.round(Math.random() * 180),
      drift: -24 + Math.round(Math.random() * 48),
    }));

    setHeartParticles(particles);
    registerEffectTimeout(() => setHeartParticles([]), 1800);
  }

  function triggerNegativeEffect() {
    setDamageEffectOn(true);
    registerEffectTimeout(() => setDamageEffectOn(false), 520);
  }

  const meterLeft = useMemo(() => ((score + 100) / 200) * 100, [score]);
  const mood = useMemo(() => {
    if (score >= 70) return "心動";
    if (score >= 20) return "好奇";
    if (score > -20) return "觀望";
    if (score > -70) return "反感";
    return "警戒";
  }, [score]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading || ended === "failure") return;

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

      // Auto-show 預定門票 button when reply mentions bar URL
      if (data.reply.includes("goodshow.club")) {
        nextItems.push({
          id: crypto.randomUUID(),
          role: "ai",
          text: "",
          time: nowLabel(),
          button: { text: "預定門票", url: "https://www.goodshow.club/" },
        });
      }

      // Add image if one was sent
      if (data.image) {
        if (data.imageCaption) {
          nextItems.push({
            id: crypto.randomUUID(),
            role: "ai",
            text: data.imageCaption,
            time: nowLabel(),
          });
        }
        nextItems.push({
          id: crypto.randomUUID(),
          role: "ai",
          text: "",
          time: nowLabel(),
          media: { type: "image", url: data.image },
        });
      }

      if (data.ending && !ended) {
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
        
        // Add button if available
        if (data.ending.payload.buttonText && data.ending.payload.buttonUrl) {
          nextItems.push({
            id: crypto.randomUUID(),
            role: "ai",
            text: "",
            time: nowLabel(),
            button: { text: data.ending.payload.buttonText, url: data.ending.payload.buttonUrl },
          });
        }
      }

      if (data.delta > 0) triggerPositiveEffect();
      if (data.delta < 0) triggerNegativeEffect();

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

  function restartAfterFailure() {
    setScore(0);
    setInput("");
    setEnded(null);
    setCharacterName("梅");
    setCharacterAvatar("/mei-avatar.png");
    setSentImageUrls(new Set());
    setHeartParticles([]);
    setDamageEffectOn(false);
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
      <main
        className={`chat-shell chat-shell-rose w-full max-w-2xl overflow-hidden ${damageEffectOn ? "damage-shake" : ""}`}
        style={{ aspectRatio: "9 / 14" }}
      >
        <div className="hearts-layer" aria-hidden="true">
          {heartParticles.map((particle) => (
            <span
              key={particle.id}
              className="heart-particle"
              style={{
                left: `${particle.left}%`,
                fontSize: `${particle.size}px`,
                animationDuration: `${particle.duration}ms`,
                animationDelay: `${particle.delay}ms`,
                transform: `translateX(${particle.drift}px)`,
              }}
            >
              ❤
            </span>
          ))}
        </div>
        <div className={`damage-overlay ${damageEffectOn ? "active" : ""}`} aria-hidden="true" />
        <section className="flex h-full flex-col">
          <header className="border-b border-[#9a7441]/35 bg-[#120b15]/90 px-4 py-2 md:px-6 md:py-3 flex-shrink-0 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={characterAvatar}
                  alt={`${characterName} avatar`}
                  className="h-[52px] w-[52px] rounded-full border border-[#9a7441]/65 object-cover shadow-sm"
                />
                <div>
                <h1 className="chat-header-title text-lg font-bold text-[#f3d8b1] md:text-xl">*有料呻吟-牛郎攻略（梅）DEMO</h1>
                <p className="text-xs md:text-sm text-[#e8c89a]">角色: {characterName}</p>
                </div>
              </div>
              <div className="rounded-full border border-[#9a7441]/45 bg-[#1a1322]/85 px-3 py-1 text-xs font-semibold text-[#f4d7b6] shadow-sm whitespace-nowrap">
                心情: {mood}
              </div>
            </div>

            <div className="mt-2">
              <div className="mb-0.5 flex items-center justify-between text-xs text-[#f0d0a8]">
                <span>好感度 {score} / 100</span>
              </div>
              <div className="score-track">
                <div className="score-thumb" style={{ left: `${meterLeft}%` }} />
              </div>
              <div className="mt-0.5 flex justify-between text-[10px] text-[#cfa87a]/85">
                <span>-100</span>
                <span>0</span>
                <span>+100</span>
              </div>
            </div>
          </header>

          <div ref={scrollContainerRef} className="flex-1 space-y-2 overflow-y-auto bg-black/25 px-3 py-2 md:px-4 md:py-3">
            {items.map((item) => {
              const align = item.role === "user" ? "justify-end" : "justify-start";
              const bubbleClass = item.role === "user" ? "bubble-self" : "bubble-ai";

              return (
                <div key={item.id} className={`flex ${align}`}>
                  {item.role === "ai" && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={characterAvatar}
                        alt={`${characterName} avatar`}
                        className="mr-2 mt-1 h-9 w-9 shrink-0 rounded-full border border-[#9a7441]/60 object-cover"
                      />
                    </>
                  )}
                  <div className={`bubble ${bubbleClass}`}>
                    {item.media?.type === "image" && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.media.url} alt="ending" className="h-auto w-48 rounded-xl object-cover" />
                      </>
                    )}
                    {item.media?.type === "video" && (
                      <video className="w-48 rounded-xl" controls preload="none">
                        <source src={item.media.url} type="video/mp4" />
                      </video>
                    )}
                    {item.text && <p className="text-sm text-[#f4e8ff]">{item.text}</p>}
                    {item.button && (
                      <a
                        href={item.button.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-deep)] transition"
                      >
                        {item.button.text}
                      </a>
                    )}

                    <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-[#dbc4f2]/80">
                      {typeof item.delta === "number" && item.delta !== 0 && (
                        <span className={item.delta >= 0 ? "text-[#d9b2ff]" : "text-rose-300"}>
                          {`好感度${item.delta > 0 ? `+${item.delta}` : item.delta}`}
                        </span>
                      )}
                      <span>{item.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="border-t border-[#9a7441]/35 bg-[#120b15]/90 px-3 py-2 md:px-4 flex-shrink-0 backdrop-blur-sm">
            {ended === "success" && (
              <div className="mb-2 rounded-xl border border-emerald-400/40 bg-emerald-900/25 px-3 py-1.5 text-xs md:text-sm text-emerald-100">
                你已達成 +100 好感度！繼續傾偈或重新開始。
              </div>
            )}
            {ended === "failure" && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-400/40 bg-rose-900/30 px-3 py-1.5 text-xs md:text-sm text-rose-100">
                <span>攻略失敗，你已被封鎖。</span>
                <button
                  type="button"
                  onClick={restartAfterFailure}
                  className="rounded-full bg-[#d76cff] px-3 py-1 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(181,74,255,0.35)] transition hover:bg-[#c14ef2]"
                >
                  重新開始
                </button>
              </div>
            )}
            <form className="flex gap-2" onSubmit={sendMessage}>
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="min-w-0 flex-1 rounded-full border border-[#c3a7d8] bg-white px-4 py-2 text-base text-[#402150] outline-none ring-purple-500 transition placeholder:text-[#8f6ea8] focus:ring-2"
                placeholder={ended === "failure" ? "攻略失敗，你已被封鎖" : "輸入訊息，試著攻略他..."}
                disabled={loading || ended === "failure"}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || ended === "failure"}
                className="rounded-full bg-[#d76cff] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(181,74,255,0.45)] transition hover:bg-[#c14ef2] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? "傳送中..." : "送出"}
              </button>
            </form>
          </footer>
        </section>
      </main>
    </div>
  );
}
