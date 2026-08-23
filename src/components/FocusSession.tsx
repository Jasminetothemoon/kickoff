"use client";
// AI Body Doubling 陪伴冲刺(P1-1):三阶段单页流 — 开场设定 → 全屏单任务计时(Pace 轻声在场)→ 结束双问;
// POST /api/sessions 记录会话并取回 Pace 的结束语;断网/API 不可用时用本地结束语兜底,流程照常走完
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AgentAvatar from "./AgentAvatar";
import { postJson } from "./data";

type Phase = "setup" | "run" | "review" | "done";

/** POST /api/sessions 返回契约:{ ok, id, message(Pace 按语气生成的会话结束语) } */
type SessionResult = { ok: boolean; id: string; message: string };

/** Pace 在场语:语气克制、不打断;每消耗 25% 进度轻声出现一条,跨会话随机起点轮换 */
const PRESENCE_LINES = [
  "🟢 我还在,你继续",
  "前 25% 走完了 — 不用快,保持这个节奏就好",
  "🟢 我就坐在这儿,别的事先放一放",
  "进度过半,呼吸一下,肩膀放松",
  "🟢 你不需要做到完美,继续就好",
  "75% — 快到了,手机先让它躺一会儿",
  "🟢 最后一段,做完就停,说到做到",
  "到这里都算数 — 我陪你走完这一段",
];

/** 断网兜底:本地结束语(语气与 Pace 一致,流程不中断) */
function localClosing(completed: boolean): string {
  return completed
    ? "🟢 做完就停,说到做到 — 这次冲刺算数。先离开书桌歇一下,别顺手加任务。"
    : "🟢 只做了一部分也算开始 — 你今天进场了,这本身就算数。歇一下,下次我们再冲一轮。";
}

export default function FocusSession() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [goalText, setGoalText] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [left, setLeft] = useState(0);
  const [whisper, setWhisper] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState("");
  const shownQuartile = useRef(0); // 已出现过在场语的进度档(每 25% 一档)
  const lineCursor = useRef(0); // 在场语轮换游标(每次会话随机起点)

  // 计时:每秒 -1,到点进入结束双问
  useEffect(() => {
    if (phase !== "run" || left <= 0) return;
    const iv = setInterval(() => setLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(iv);
  }, [phase, left]);

  // 到点 → 结束双问(提前退出也走同一收尾)
  useEffect(() => {
    if (phase === "run" && left <= 0) setPhase("review");
  }, [phase, left]);

  // Pace 在场感:每消耗 25% 进度,轻声出现一条(不弹窗、不打断)
  useEffect(() => {
    if (phase !== "run" || left <= 0) return;
    const totalSec = minutes * 60;
    if (totalSec <= 0) return;
    const q = Math.floor(((totalSec - left) / totalSec) * 4);
    if (q > shownQuartile.current) {
      shownQuartile.current = q;
      setWhisper(PRESENCE_LINES[lineCursor.current % PRESENCE_LINES.length]);
      lineCursor.current += 1;
    }
  }, [phase, left, minutes]);

  // 全屏阶段(timer-screen 遮罩)锁定背景滚动,与 CountdownTimer 同一习惯
  useEffect(() => {
    if (phase === "setup") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  const goal = goalText.trim();
  const totalSec = minutes * 60;
  const consumedPct = totalSec > 0 ? Math.min(100, ((totalSec - left) / totalSec) * 100) : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  const start = () => {
    if (!goal) return;
    setLeft(minutes * 60);
    shownQuartile.current = 0;
    lineCursor.current = Math.floor(Math.random() * PRESENCE_LINES.length);
    setWhisper("🟢 Pace 进场 — 计时开始,这一轮我们只做这一件事");
    setPhase("run");
  };

  const submit = async () => {
    if (completed === null || submitting) return;
    setSubmitting(true);
    let msg = localClosing(completed);
    try {
      const res = await postJson<SessionResult>("/api/sessions", {
        goalText: goal,
        minutes,
        completed,
        note: note.trim() || undefined,
      });
      if (res?.message) msg = res.message;
    } catch {
      // 断网兜底:本地结束语,流程照常走完
    }
    setClosing(msg);
    setSubmitting(false);
    setPhase("done");
  };

  const restart = () => {
    setCompleted(null);
    setNote("");
    setLeft(0);
    setWhisper(null);
    setClosing("");
    setPhase("setup");
  };

  // ===== 1) 开场:说好这一轮只做什么、做多长时间 =====
  if (phase === "setup") {
    return (
      <>
        <div className="card">
          <span className="tag t-teal">Pace · 陪伴冲刺</span>
          <h3>这次冲刺要做什么?</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AgentAvatar agent="Pace" size={32} />
            <p className="sub" style={{ margin: 0 }}>
              Pace 会坐到你旁边,全程在场 — 先说好只做这一件事,做完就停,谁也不加戏。
            </p>
          </div>
          <input
            className="input mt10"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") start();
            }}
            maxLength={80}
            placeholder="一句话就好,比如:写完 intro.py 的前 10 行"
            aria-label="这次冲刺要做什么"
          />
          <div className="sub mt6" style={{ textAlign: "right" }}>
            {goalText.length}/80
          </div>

          <div className="sub" style={{ marginTop: 10, fontWeight: 600, color: "var(--slate)" }}>
            冲多久?
          </div>
          <div className="seg" style={{ width: "100%", marginTop: 6 }}>
            {[10, 25].map((m) => (
              <button
                key={m}
                type="button"
                className={minutes === m ? "on" : ""}
                style={{ flex: 1 }}
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
              >
                {m} 分钟{m === 10 ? " · 容易启动" : " · 进入状态"}
              </button>
            ))}
          </div>

          {goal && (
            <div className="intent mt10 fade-in">先说好:这一轮只做「{goal}」,{minutes} 分钟,做完就停。</div>
          )}

          <button className="btn btn-main mt10" onClick={start} disabled={!goal}>
            Pace 进场 🟢
          </button>
        </div>
        <div className="sub center">
          进场后整屏只剩计时和 Pace 的轻声在场 — 到点一起收尾,不用你自己盯着钟。
        </div>
      </>
    );
  }

  // ===== 2) 会话中:整屏单任务 — 只有大圆环倒计时与 Pace 的在场语 =====
  if (phase === "run") {
    return (
      <div className="timer-screen" role="dialog" aria-modal="true" aria-label="陪伴冲刺进行中">
        <div className="pacechip">🟢 Pace 在场 · 陪你冲刺</div>

        <div className="timer">
          <div
            className="ring"
            style={{ background: `conic-gradient(var(--teal) 0 ${consumedPct}%, #D9EEE9 ${consumedPct}% 100%)` }}
            aria-live="off"
          >
            <div className="ring-in">
              <b>
                {mm}:{ss}
              </b>
              <small>
                已进行 {Math.floor(consumedPct)}% · 共 {minutes} 分钟
              </small>
            </div>
          </div>
        </div>

        <p className="sub" style={{ maxWidth: 320 }}>
          只做「{goal}」— 做完就停,不加戏
        </p>

        <div
          aria-live="polite"
          style={{
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          {whisper && (
            <span
              key={whisper}
              className="fade-in"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                color: "#fff",
                fontSize: 13.5,
                fontWeight: 600,
                lineHeight: 1.6,
              }}
            >
              <AgentAvatar agent="Pace" size={44} />
              {whisper}
            </span>
          )}
        </div>

        <button
          className="btn btn-ghost"
          style={{ color: "#C7CDF7" }}
          onClick={() => setPhase("review")}
        >
          我先停了(无惩罚,照常收尾)
        </button>
      </div>
    );
  }

  // ===== 3) 结束双问:完成了吗(二选一)+ 一句话感受(可选)→ POST /api/sessions =====
  if (phase === "review") {
    return (
      <div className="timer-screen" role="dialog" aria-modal="true" aria-label="冲刺结束">
        <div className="pacechip">🟢 到点了 — Pace 陪你收尾</div>
        <div className="continue-card fade-in">
          <h3>完成了吗?</h3>
          <p className="sub">怎么答都算数 — 只做了一部分,也是今天真实发生的开始。</p>
          <div className="dur-chips">
            <button
              className={"dur-chip" + (completed === true ? " on" : "")}
              onClick={() => setCompleted(true)}
              aria-pressed={completed === true}
            >
              ✓ 完成了
            </button>
            <button
              className={"dur-chip" + (completed === false ? " on" : "")}
              onClick={() => setCompleted(false)}
              aria-pressed={completed === false}
            >
              只做了一部分
            </button>
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            maxLength={60}
            placeholder="一句话感受(可不填)"
            aria-label="一句话感受"
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,.3)",
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              outline: "none",
            }}
          />
          <button className="btn btn-main" onClick={submit} disabled={completed === null || submitting}>
            {submitting ? "Pace 正在写结束语…" : "记下这次冲刺"}
          </button>
        </div>
      </div>
    );
  }

  // ===== 收尾:展示 Pace 结束语(API 返回;失败时为本地兜底文案)=====
  return (
    <div className="timer-screen" role="dialog" aria-modal="true" aria-label="冲刺已记录">
      <div className="pacechip">🟢 Pace · 本次冲刺已记下 · {minutes} 分钟</div>
      <div className="continue-card fade-in">
        <h3>{completed ? "🎉 做完就停,说到做到" : "🌱 进场就算赢"}</h3>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 10 }}>
          <AgentAvatar agent="Pace" size={32} />
          <p
            className="sub"
            style={{ color: "#fff", fontSize: 13.5, lineHeight: 1.7, margin: 0, textAlign: "left" }}
          >
            {closing}
          </p>
        </div>
        <Link href="/today" className="btn btn-main">
          回到今天
        </Link>
        <button className="btn btn-ghost" style={{ color: "#C7CDF7" }} onClick={restart}>
          再冲一轮(还是这件事)
        </button>
      </div>
    </div>
  );
}
