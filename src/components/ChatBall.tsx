"use client";
// 四 Agent 对话面板:底部弹起的聊天流(Coach 计划 / Spark 拆解 / Pace 动力 / Mirror 复盘)
// 调 POST /api/chat({ message, mood? });agent=Spark 的响应带 startCard/steps 时在回复下方渲染
import { useEffect, useRef, useState } from "react";
import AgentAvatar from "./AgentAvatar";
import { postJson } from "./data";

type AgentName = "Coach" | "Spark" | "Pace" | "Mirror";

const AGENT_KEYS: readonly string[] = ["Coach", "Spark", "Pace", "Mirror"];

// 四 Agent 各配色(Coach 靛 / Spark 橙 / Pace 青 / Mirror 琥珀,取自 globals.css 变量)
const AGENT_META: Record<AgentName, { emoji: string; color: string; light: string; label: string }> = {
  Coach: { emoji: "🗺️", color: "var(--indigo)", light: "var(--indigo-l)", label: "计划" },
  Spark: { emoji: "🧩", color: "var(--orange)", light: "var(--orange-l)", label: "拆解" },
  Pace: { emoji: "🧘", color: "var(--teal)", light: "var(--teal-l)", label: "动力" },
  Mirror: { emoji: "🪞", color: "var(--amber)", light: "var(--amber-l)", label: "复盘" },
};

interface StartCardLite {
  firstStep: string;
  minutes: number;
  doneCriteria?: string;
  intent?: string;
}

interface ChatMessage {
  id: number;
  role: "me" | "ai";
  text: string;
  agent?: AgentName;
  startCard?: StartCardLite;
  steps?: { title: string; minutes: number }[];
  crisis?: boolean;
}

// 响应按宽松类型收口,运行时再逐字段校验,避免后端字段缺失时整页崩掉
interface ChatApiResponse {
  agent?: string;
  reply?: string;
  crisis?: boolean;
  data?: {
    startCard?: { firstStep?: string; minutes?: number; doneCriteria?: string; intent?: string };
    steps?: { title?: string; minutes?: number }[];
  };
}

const WELCOME =
  "我是你的学习小队 👋 拆任务找 Spark,看计划找 Coach,复盘找 Mirror,没动力就喊 Pace";

const QUICK_CHIPS = ["帮我拆解这个任务", "看看我的计划", "复盘一下今天", "我完全没动力"];

const FALLBACK_REPLY =
  "小队这会儿联系不上(网络开小差了)😵‍💫 稍等几秒再发一次,或先点点上面的快捷提问。";

export default function ChatBall({
  open,
  onClose,
  mood,
}: {
  open: boolean;
  onClose: () => void;
  mood?: string | null;
}) {
  // 消息状态存本地;组件常驻(FloatingBall 挂载),关闭再开记录保留
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 0, role: "ai", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  // 打开时锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // 新消息 / 加载态变化时自动滚到底部
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  if (!open) return null;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { id: idRef.current++, role: "me", text }]);
    setBusy(true);
    let next: ChatMessage;
    try {
      const res = await postJson<ChatApiResponse>("/api/chat", {
        message: text,
        mood: mood ?? undefined,
      });
      const agentRaw = typeof res?.agent === "string" ? res.agent : "";
      const agent: AgentName = AGENT_KEYS.includes(agentRaw) ? (agentRaw as AgentName) : "Coach";
      const sc = res?.data?.startCard;
      const steps = (res?.data?.steps ?? [])
        .filter((s): s is { title: string; minutes?: number } => typeof s?.title === "string")
        .map((s) => ({ title: s.title, minutes: Number(s.minutes) || 0 }));
      next = {
        id: idRef.current++,
        role: "ai",
        agent,
        crisis: res?.crisis === true,
        text:
          typeof res?.reply === "string" && res.reply.trim()
            ? res.reply
            : "(小队沉默了一下…再问一次试试?)",
        startCard:
          sc && typeof sc.firstStep === "string"
            ? {
                firstStep: sc.firstStep,
                minutes: Number(sc.minutes) || 2,
                doneCriteria: typeof sc.doneCriteria === "string" ? sc.doneCriteria : undefined,
                intent: typeof sc.intent === "string" ? sc.intent : undefined,
              }
            : undefined,
        steps: steps.length > 0 ? steps : undefined,
      };
    } catch {
      next = { id: idRef.current++, role: "ai", text: FALLBACK_REPLY };
    }
    setMessages((prev) => [...prev, next]);
    setBusy(false);
  };

  return (
    <div
      className="modal-mask"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="学习小队对话"
      style={{ alignItems: "flex-end", padding: 0 }}
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: "86vh", borderRadius: "22px 22px 0 0", overflow: "hidden" }}
      >
        <div className="row">
          <b className="sheet-title">💬 学习小队 · 四个伙伴随时在线</b>
          <button className="x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {/* 聊天流:内部滚动,输入区固定在底部 */}
        <div
          className="chat"
          ref={listRef}
          style={{ flex: 1, minHeight: 160, maxHeight: "46vh", overflowY: "auto", paddingRight: 2 }}
        >
          {messages.map((m) => {
            if (m.role === "me") {
              return (
                <div key={m.id} className="bubble me">
                  {m.text}
                </div>
              );
            }
            const meta = m.agent ? AGENT_META[m.agent] : null;
            const cardMeta = meta ?? AGENT_META.Spark; // 启动卡为 Spark 输出,默认橙
            const isWelcome = !m.agent && m.id === 0; // 欢迎语:四头像一排示意"小队"
            return (
              <div
                key={m.id}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, width: "100%" }}
              >
                {isWelcome && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-label="学习小队四个伙伴">
                    {AGENT_KEYS.map((k) => (
                      <AgentAvatar key={k} agent={k as AgentName} size={20} />
                    ))}
                  </div>
                )}
                {m.agent && (
                  <span
                    className="tag"
                    style={{
                      background: AGENT_META[m.agent].light,
                      color: AGENT_META[m.agent].color,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AgentAvatar agent={m.agent} size={22} />
                    {m.agent} · {AGENT_META[m.agent].label}
                  </span>
                )}
                <div
                  className="bubble ai"
                  style={
                    m.crisis
                      ? { borderLeft: "3px solid #D64E4E", background: "#FCEBEB", whiteSpace: "pre-line" }
                      : meta
                      ? { borderLeft: `3px solid ${meta.color}` }
                      : undefined
                  }
                >
                  {m.crisis ? "🧡 " : ""}
                  {m.text}
                </div>

                {m.steps && m.steps.length > 0 && (
                  <ul className="steps" style={{ width: "100%" }}>
                    {m.steps.map((s, i) => (
                      <li key={i} className={i === 0 ? "first" : ""}>
                        <span className="dot">{i === 0 ? "▶" : i + 1}</span>
                        {s.title}
                        <span className="m">{s.minutes} 分钟</span>
                      </li>
                    ))}
                  </ul>
                )}

                {m.startCard && (
                  <div
                    className="card"
                    style={{ width: "100%", boxShadow: "none", borderLeft: `4px solid ${cardMeta.color}` }}
                  >
                    <span className="tag" style={{ background: cardMeta.light, color: cardMeta.color }}>
                      今日启动卡 · 只做第一步
                    </span>
                    <div className="step-big">
                      <div className="step-num" style={{ background: cardMeta.color }}>
                        1
                      </div>
                      <div>
                        <div className="step-txt">{m.startCard.firstStep}</div>
                        <div className="step-meta">
                          预计 {m.startCard.minutes} 分钟
                          {m.startCard.doneCriteria ? ` · 完成标准:${m.startCard.doneCriteria}` : ""}
                        </div>
                      </div>
                    </div>
                    {m.startCard.intent && (
                      <div className="intent" style={{ marginTop: 10 }}>
                        🗒 执行意图:{m.startCard.intent}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {busy && (
            <div className="bubble ai" style={{ color: "var(--muted)" }}>
              …思考中
            </div>
          )}
        </div>

        {/* 快捷 chips:点击即发送对应消息 */}
        <div className="mood" style={{ marginTop: 0 }}>
          {QUICK_CHIPS.map((c) => (
            <span
              key={c}
              onClick={() => send(c)}
              style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined}
            >
              {c}
            </span>
          ))}
        </div>

        <div className="park">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="跟小队说点什么…"
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? "…" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
