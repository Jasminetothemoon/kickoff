"use client";
// AI Body Doubling 陪伴冲刺(P1-1 升级版):三阶段单页流 — 开场设定(目标联动)→ 全屏单任务计时(Pace 轻声在场)→ 结束双问(+ 记为今日启动);
// POST /api/sessions 记录会话并取回 Pace 的结束语;断网/API 不可用时用本地结束语兜底,流程照常走完;
// 沉浸感升级:青色呼吸光晕(4s,Pace 同款节律)+ 白噪音(WebAudio 棕噪音,默认关);
// 陪伴感升级:Pace 56px 常驻圆环旁,在场语加密到 7 个时机点(10%~90%),每条出现时头像弹一下;
// 目标联动:开场显示当前目标/周进度/今日任务,圆环中央带目标一句话、圆环下方常驻"这次冲刺在服务它"
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AgentAvatar from "./AgentAvatar";
import { postJson } from "./data";
import { showToast } from "./Toast";

type Phase = "setup" | "run" | "review" | "done";

/** POST /api/sessions 返回契约:{ ok, id, message(Pace 按语气生成的会话结束语) } */
type SessionResult = { ok: boolean; id: string; message: string };

/** GET /api/today 中用于冲刺联动的部分(其余字段忽略;接口失败时静默降级,冲刺照常) */
type TodayInfo = {
  goalTitle?: string | null;
  weekProgress?: { done: number; total: number };
  task?: { id: string; title: string; minutes: number } | null;
  streak?: number;
};

/** POST /api/checkins 返回契约(仅用到 celebration) */
type CheckinResult = { ok: boolean; celebration: string };

/** Pace 在场语:7 个时机点(10% 起步 → 90% 收尾),语气克制、不打断;每过一个阈值轻声出现一条 */
const PRESENCE_STEPS: { at: number; line: string }[] = [
  { at: 0.1, line: "🟢 刚开场,坐稳 — 先把身子放舒服,不用急着进入状态" },
  { at: 0.25, line: "前 25% 走完了 — 不用快,保持这个节奏就好" },
  { at: 0.4, line: "🟢 我就坐在这儿,别的事先让它们等一会儿" },
  { at: 0.55, line: "过半了 — 呼吸一下,肩膀放下来,我们继续" },
  { at: 0.7, line: "🟢 你不需要做到完美,做到现在这样就已经算数" },
  { at: 0.8, line: "只剩一小截了 — 手机先让它再躺一会儿" },
  { at: 0.9, line: "🟢 最后一小段 — 做完就停,说到做到" },
];

/** 沉浸层样式:青色呼吸光晕(4s,与 Pace 呼吸同节律)+ 头像强调动效;keyframes 统一 kickoff- 前缀 */
const FOCUS_STYLE = `
@keyframes kickoff-glow {
  0%,100% { opacity:.65; transform:scale(1); }
  50% { opacity:1; transform:scale(1.1); }
}
.kickoff-glow{position:absolute;inset:0;pointer-events:none;transform-origin:50% 45%;
  background:
    radial-gradient(circle at 50% 40%, rgba(45,212,191,.30) 0%, rgba(13,148,136,.12) 40%, transparent 70%),
    radial-gradient(circle at 50% 58%, transparent 42%, rgba(7,8,26,.62) 100%);
  animation:kickoff-glow 4s ease-in-out infinite;}
@keyframes kickoff-pop {
  0% { transform:scale(1); }
  35% { transform:scale(1.22); }
  65% { transform:scale(.95); }
  100% { transform:scale(1); }
}
.kickoff-pop{display:inline-flex;animation:kickoff-pop .55s ease-out both;}
`;

/** 断网兜底:本地结束语(语气与 Pace 一致,流程不中断) */
function localClosing(completed: boolean): string {
  return completed
    ? "🟢 做完就停,说到做到 — 这次冲刺算数。先离开书桌歇一下,别顺手加任务。"
    : "🟢 只做了一部分也算开始 — 你今天进场了,这本身就算数。歇一下,下次我们再冲一轮。";
}

/** 白噪音句柄(纯代码棕噪音,无素材;AudioContext 在点击开关时才创建,iOS Safari 手势内解锁) */
type NoiseHandle = { ctx: AudioContext; src: AudioBufferSourceNode; gain: GainNode };

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
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [noiseOn, setNoiseOn] = useState(false);
  const [checkinState, setCheckinState] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const shownStep = useRef(0); // 已出现过的在场语档(按 PRESENCE_STEPS 下标推进)
  const noiseRef = useRef<NoiseHandle | null>(null);

  // ===== 白噪音:棕噪音(低音量、循环);关闭/离场时淡出并释放 =====
  const stopNoise = () => {
    const n = noiseRef.current;
    noiseRef.current = null;
    setNoiseOn(false);
    if (!n) return;
    try {
      const t = n.ctx.currentTime;
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(Math.max(n.gain.gain.value, 0.0001), t);
      n.gain.gain.linearRampToValueAtTime(0.0001, t + 0.15);
      window.setTimeout(() => {
        try {
          n.src.stop();
        } catch {
          // 可能已停止
        }
        void n.ctx.close().catch(() => undefined);
      }, 180);
    } catch {
      try {
        void n.ctx.close().catch(() => undefined);
      } catch {
        // 忽略:音频释放失败不影响冲刺
      }
    }
  };

  const toggleNoise = () => {
    if (noiseOn) {
      stopNoise();
      return;
    }
    try {
      const AC =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC(); // 在用户手势内创建(iOS Safari 要求)
      void ctx.resume().catch(() => undefined);
      // 棕噪音:白噪声积分平滑,2 秒循环;音量低(≈0.055)只做氛围垫底
      const len = Math.floor(ctx.sampleRate * 2);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        ch[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.055, t + 0.6);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      noiseRef.current = { ctx, src, gain };
      setNoiseOn(true);
    } catch {
      setNoiseOn(false); // 生成失败静默降级,冲刺照常
    }
  };

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

  // Pace 在场感:按 7 个时机点(10%~90%)轻声出现一条(不弹窗、不打断)
  useEffect(() => {
    if (phase !== "run" || left <= 0) return;
    const total = minutes * 60;
    if (total <= 0) return;
    const p = (total - left) / total;
    let idx = shownStep.current;
    while (idx < PRESENCE_STEPS.length && p >= PRESENCE_STEPS[idx].at) idx += 1;
    if (idx > shownStep.current) {
      shownStep.current = idx;
      setWhisper(PRESENCE_STEPS[idx - 1].line);
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

  // 离开会话即停白噪音;卸载时兜底释放
  useEffect(() => {
    if (phase === "run") return;
    stopNoise();
  }, [phase]);
  useEffect(() => () => stopNoise(), []);

  // 目标联动:拉取今日目标/周进度/当前任务(失败静默 — 冲刺不依赖它)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/today");
        if (!res.ok) return;
        const data = (await res.json()) as TodayInfo;
        if (!alive) return;
        setToday(data);
        const t = data.task;
        if (t) setGoalText((prev) => (prev.trim() ? prev : t.title)); // 预填当前任务,冲刺天然服务它
      } catch {
        // 断网兜底:无目标信息时照常冲刺
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goal = goalText.trim();
  const totalSec = minutes * 60;
  const consumedPct = totalSec > 0 ? Math.min(100, ((totalSec - left) / totalSec) * 100) : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const wp = today?.weekProgress;
  const wpPct = wp && wp.total > 0 ? Math.min(100, (wp.done / wp.total) * 100) : 0;
  const ringGoal = today?.goalTitle || goal; // 圆环中央的目标一句话

  const start = () => {
    if (!goal) return;
    setLeft(minutes * 60);
    shownStep.current = 0;
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

  // 结束页联动:把这次冲刺记为今日启动(无 task 时按钮不渲染)
  const checkin = async () => {
    const t = today?.task;
    if (!t || checkinState === "sending" || checkinState === "done") return;
    setCheckinState("sending");
    try {
      const res = await postJson<CheckinResult>("/api/checkins", {
        taskId: t.id,
        taskTitle: t.title,
        granularity: minutes, // 本次冲刺分钟数
        note: note.trim() ? `陪伴冲刺:${note.trim()}` : "陪伴冲刺",
      });
      if (res?.ok) {
        setCheckinState("done");
        showToast(res.celebration || "🎉 已记为今日启动");
      } else {
        setCheckinState("failed");
      }
    } catch {
      setCheckinState("failed"); // 静默提示:不弹窗、不打断收尾
    }
  };

  const restart = () => {
    setCompleted(null);
    setNote("");
    setLeft(0);
    setWhisper(null);
    setClosing("");
    setPhase("setup");
  };

  /** 结束流共用的「记为今日启动」按钮(checkinState 保持跨阶段,避免重复打卡) */
  const renderCheckinButton = () => {
    const t = today?.task;
    if (!t || checkinState === "done") return null;
    const sending = checkinState === "sending";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          className="dur-chip"
          style={{ width: "100%", padding: "11px 14px", opacity: sending ? 0.65 : 1 }}
          onClick={checkin}
          disabled={sending}
          aria-live="polite"
        >
          {sending ? "正在记录…" : "✓ 把这次冲刺记为今日启动"}
        </button>
        {checkinState === "failed" && (
          <small className="sub" style={{ textAlign: "center", fontSize: 10.5 }}>
            这次没记上 — 不影响冲刺本身算数,联网后可再来
          </small>
        )}
      </div>
    );
  };

  // ===== 1) 开场:说好这一轮只做什么、做多长时间;顶部联动当前目标/周进度/今日任务 =====
  if (phase === "setup") {
    return (
      <>
        <div className="card">
          {(today?.goalTitle || today?.task) && (
            <div
              style={{
                background: "var(--teal-l)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 7,
                marginBottom: 10,
              }}
              aria-label="当前目标信息"
            >
              {today?.goalTitle && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--teal)", lineHeight: 1.5 }}>
                  🎯 当前目标:{today.goalTitle}
                </div>
              )}
              {wp && wp.total > 0 && (
                <>
                  <div className="track" aria-hidden="true">
                    <div className="fill" style={{ width: `${wpPct}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    本周进度 {wp.done}/{wp.total}
                    {today?.streak ? ` · 🔥 已连续启动 ${today.streak} 天` : ""}
                  </div>
                </>
              )}
              {today?.task && (
                <div style={{ fontSize: 11.5, color: "var(--slate)", lineHeight: 1.5 }}>
                  📌 今日任务:{today.task.title}({today.task.minutes} 分钟)— 这次冲刺就服务它
                </div>
              )}
            </div>
          )}
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

  // ===== 2) 会话中:深色呼吸光晕 + 大圆环 + Pace 56px 常驻在场 + 环境音 =====
  if (phase === "run") {
    return (
      <div className="timer-screen" role="dialog" aria-modal="true" aria-label="陪伴冲刺进行中">
        <style>{FOCUS_STYLE}</style>
        <div className="kickoff-glow" aria-hidden="true" />
        <div className="pacechip">🟢 Pace 在场 · 陪你冲刺</div>

        <div className="timer">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              className="ring"
              style={{ background: `conic-gradient(var(--teal) 0 ${consumedPct}%, #D9EEE9 ${consumedPct}% 100%)` }}
              aria-live="off"
              role="timer"
              aria-label={`剩余 ${mm} 分 ${ss} 秒`}
            >
              <div className="ring-in">
                <b>
                  {mm}:{ss}
                </b>
                <small>
                  已进行 {Math.floor(consumedPct)}% · 共 {minutes} 分钟
                </small>
                {ringGoal && (
                  <small
                    style={{
                      display: "block",
                      margin: "3px auto 0",
                      maxWidth: 118,
                      color: "var(--teal)",
                      fontWeight: 700,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={ringGoal}
                  >
                    🎯 {ringGoal}
                  </small>
                )}
              </div>
            </div>

            {/* Pace 常驻圆环旁:每条在场语出现时 kickoff-pop 弹一下强调 */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: "none" }}>
              <span
                key={whisper ?? "pace-here"}
                className="kickoff-pop"
                style={{ borderRadius: "50%", filter: "drop-shadow(0 0 14px rgba(94,234,212,.5))" }}
              >
                <AgentAvatar agent="Pace" size={56} />
              </span>
              <small style={{ color: "#7DD3C8", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>在场</small>
            </div>
          </div>
        </div>

        {today?.task ? (
          <p className="sub" style={{ color: "#D1FAE5", fontSize: 12.5, fontWeight: 600, maxWidth: 340 }}>
            🎯 这次冲刺在服务它:「{today.task.title}」
          </p>
        ) : (
          <p className="sub" style={{ maxWidth: 320 }}>
            只做「{goal}」— 做完就停,不加戏
          </p>
        )}

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
              {whisper}
            </span>
          )}
        </div>

        <button
          type="button"
          className={"dur-chip" + (noiseOn ? " on" : "")}
          aria-pressed={noiseOn}
          aria-label="环境音开关(棕噪音)"
          onClick={toggleNoise}
          style={{ padding: "9px 18px", fontSize: 12 }}
        >
          🌊 环境音 · {noiseOn ? "开" : "关"}
        </button>

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

  // ===== 3) 结束双问:完成了吗(二选一)+ 一句话感受(可选)→ POST /api/sessions;有今日任务时一键记为今日启动 =====
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

          {today?.task && (
            <div
              style={{
                borderTop: "1px dashed rgba(255,255,255,.22)",
                paddingTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div className="sub" style={{ fontSize: 11, textAlign: "center" }}>
                这次冲刺在服务今日任务「{today.task.title}」
              </div>
              {checkinState === "done" ? (
                <div
                  className="dur-chip on"
                  style={{ width: "100%", padding: "11px 14px", textAlign: "center" }}
                  aria-live="polite"
                >
                  ✓ 已记为今日启动
                </div>
              ) : (
                renderCheckinButton()
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== 收尾:展示 Pace 结束语(API 返回;失败时为本地兜底文案);未打卡可补记 =====
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
        {checkinState === "done" ? (
          <div className="sub" style={{ textAlign: "center" }}>
            ✓ 这次冲刺已记为今日启动
          </div>
        ) : (
          renderCheckinButton()
        )}
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
