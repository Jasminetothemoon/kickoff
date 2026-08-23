"use client";
// 全屏倒计时模态:conic-gradient 圆环,支持 2 分钟 / 10 / 15 分钟 / 冲刺(优先用 API/localStorage 同步后的设置);
// 计时中可把杂念「停车」(POST /api/park);到点弹「要继续吗?」,打卡调 POST /api/checkins,成功后庆祝 toast 并关闭
import { useEffect, useState } from "react";
import type { CheckInResult } from "@/lib/types";
import AgentAvatar from "./AgentAvatar";
import { loadSettings, postJson, saveSettings } from "./data";
import { showToast } from "./Toast";

type Phase = "run" | "paused" | "done";

// 微复盘:打卡前的四个情绪选项(PRD P0-1)
const REVIEW_MOODS = ["轻松", "勉强", "焦虑", "状态不错"] as const;

export default function CountdownTimer({
  open,
  onClose,
  taskId,
  mood,
  granularity,
  onCheckedIn,
}: {
  open: boolean;
  onClose: () => void;
  taskId?: string;
  mood?: string | null;
  granularity?: number;
  onCheckedIn?: () => void;
}) {
  const [sprint, setSprint] = useState(10); // 设置里的冲刺时长(同步后的值)
  const [dur, setDur] = useState(2); // 当前时长(分钟)
  const [left, setLeft] = useState(120); // 剩余秒
  const [phase, setPhase] = useState<Phase>("run");
  const [runId, setRunId] = useState(0);
  const [checking, setChecking] = useState(false);
  const [parkText, setParkText] = useState(""); // 杂念停车场输入
  const [parking, setParking] = useState(false);
  const [reviewMood, setReviewMood] = useState<string | null>(null); // 微复盘情绪(打卡时覆盖外部 mood prop)
  const [reviewNote, setReviewNote] = useState(""); // 微复盘一句话(≤200,可选)

  // 每次打开:读本地设置冲刺时长,并后台拉账户设置修正;重置为 2 分钟倒计时
  useEffect(() => {
    if (!open) return;
    const local = loadSettings();
    setSprint(local.sprintMinutes);
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { focusSupport?: { sprintMinutes?: number } }) => {
        const m = d?.focusSupport?.sprintMinutes;
        if (typeof m === "number" && m > 0) {
          setSprint(m);
          if (m !== local.sprintMinutes) saveSettings({ ...local, sprintMinutes: m });
        }
      })
      .catch(() => {
        // 账户不可用:用 localStorage 的冲刺时长,计时不受影响
      });
    setDur(2);
    setLeft(120);
    setPhase("run");
    setParkText("");
    setReviewMood(null);
    setReviewNote("");
    setRunId((n) => n + 1);
  }, [open]);

  // 打开时锁定背景滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 计时(到点自动进入 done)
  useEffect(() => {
    if (!open || phase !== "run") return;
    if (left <= 0) {
      setPhase("done");
      return;
    }
    const iv = setInterval(() => setLeft((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(iv);
  }, [open, phase, runId, left]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = dur * 60;
  const pct = total > 0 ? (left / total) * 100 : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const donePct = phase === "done" ? 100 : pct;
  const ringColor = phase === "done" ? "var(--orange)" : "var(--teal)";
  // 2 分钟微启动 + 10/15 保留;若同步来的冲刺时长不在其中则加入
  const durations = Array.from(new Set([2, 10, 15, sprint])).sort((a, b) => a - b);

  const switchDur = (m: number) => {
    setDur(m);
    setLeft(m * 60);
    setPhase("run");
    setRunId((n) => n + 1);
  };

  // 杂念停车场:记下即回到当前步骤;API 不可用时静默丢弃并给演示文案
  const parkIt = async () => {
    const text = parkText.trim();
    if (!text || parking) return;
    setParking(true);
    try {
      await postJson<{ ok: boolean; count: number }>("/api/park", { text });
      setParkText("");
      showToast("已存入停车场,稍后处理 — 现在回到当前步骤");
    } catch {
      setParkText("");
      showToast("演示模式:已记下,稍后处理 — 现在回到当前步骤");
    } finally {
      setParking(false);
    }
  };

  const checkin = async () => {
    setChecking(true);
    let msg = "🎉 完成!多巴胺到账 — 今天你已经启动了";
    const note = reviewNote.trim().slice(0, 200);
    try {
      const res = await postJson<CheckInResult>("/api/checkins", {
        taskId: taskId ?? "demo-task",
        mood: reviewMood ?? mood ?? undefined, // 微复盘里选的情绪优先,其次外部传入的 mood
        note: note || undefined,
        granularity: granularity ?? dur,
        delaySeconds: dur * 60 - left,
      });
      if (res?.celebration) msg = res.celebration;
      if (res?.adjustments?.length) msg += ` ${res.adjustments[0]}`;
      if (Array.isArray((res as { newAchievements?: unknown }).newAchievements)) {
        const news = (res as { newAchievements?: { key: string; title: string; icon: string }[] }).newAchievements;
        if (news && news.length > 0) {
          window.dispatchEvent(new CustomEvent("kickoff:achievements", { detail: news }));
        }
      }
    } catch {
      // API 不可用:本地庆祝,保持体验完整(微复盘信息随静默打卡一起丢弃)
    }
    setChecking(false);
    showToast(msg);
    onClose();
    onCheckedIn?.();
  };

  return (
    <div className="timer-screen" role="dialog" aria-modal="true" aria-label="专注倒计时">
      <div className="pacechip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <AgentAvatar agent="Pace" size={18} />
        Pace 正在陪你 · 专注会话
      </div>

      <div className="timer">
        <div
          className="ring"
          style={{ background: `conic-gradient(${ringColor} 0 ${donePct}%, #D9EEE9 ${donePct}% 100%)` }}
          aria-live="off"
        >
          <div className="ring-in">
            <b>{phase === "done" ? "🎉" : `${mm}:${ss}`}</b>
            <small>{phase === "done" ? "到点啦 · 干得漂亮" : `剩余 / ${dur}:00`}</small>
          </div>
        </div>
      </div>

      <p className="sub">
        {phase === "done"
          ? "只做 2 分钟 — 你已经完成了对自己的承诺"
          : `只做 ${dur} 分钟,到时可随时停 — 你已经启动了`}
      </p>

      {phase !== "done" ? (
        <>
          <div className="dur-chips">
            {durations.map((m) => (
              <button
                key={m}
                className={"dur-chip" + (dur === m ? " on" : "")}
                onClick={() => switchDur(m)}
              >
                {m} 分钟{m === sprint && m !== 2 ? " · 冲刺" : ""}
              </button>
            ))}
            <button
              className="dur-chip"
              onClick={() => setPhase((p) => (p === "paused" ? "run" : "paused"))}
            >
              {phase === "paused" ? "▶ 继续" : "⏸ 暂停"}
            </button>
          </div>
          <button className="btn btn-ghost" style={{ color: "#C7CDF7" }} onClick={onClose}>
            我先停了(无惩罚)
          </button>

          {/* 杂念停车场:仅计时进行中显示 */}
          <div
            className="fade-in"
            style={{
              width: "min(340px,100%)",
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 18,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>🅿️ 杂念停车场</div>
            <div style={{ fontSize: 10.5, color: "#C7CDF7", lineHeight: 1.5, marginTop: 2 }}>
              冒出别的念头?先停在这里,不占用脑内内存
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <input
                value={parkText}
                onChange={(e) => setParkText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") parkIt();
                }}
                placeholder="记下这个念头…"
                aria-label="杂念停车场"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid rgba(255,255,255,.3)",
                  background: "rgba(255,255,255,.08)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "9px 11px",
                  fontSize: 12,
                  outline: "none",
                }}
              />
              <button
                onClick={parkIt}
                disabled={parking || !parkText.trim()}
                style={{
                  flex: "none",
                  border: "none",
                  background: "#fff",
                  color: "var(--deep)",
                  borderRadius: 10,
                  padding: "0 14px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                记下
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="continue-card fade-in">
          <h3>要继续吗?</h3>
          <p className="sub">两分钟法则:开始之后想继续是本能 — 不想继续也完全 OK</p>

          {/* 微复盘:四个情绪 chip + 一行可选笔记,都可不填 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>
              🌤️ 微复盘
              <span style={{ fontSize: 10.5, fontWeight: 400, color: "#C7CDF7", marginLeft: 6 }}>可选 · 一秒就够</span>
            </div>
            <div className="dur-chips" style={{ justifyContent: "flex-start" }}>
              {REVIEW_MOODS.map((m) => (
                <button
                  key={m}
                  className={"dur-chip" + (reviewMood === m ? " on" : "")}
                  style={{ padding: "6px 13px", fontSize: 11.5 }}
                  onClick={() => setReviewMood(reviewMood === m ? null : m)}
                  aria-pressed={reviewMood === m}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="一句话:刚才什么最卡?"
              maxLength={200}
              aria-label="微复盘一句话"
              style={{
                width: "100%",
                border: "1px solid rgba(255,255,255,.3)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 12,
                outline: "none",
              }}
            />
          </div>

          <button className="btn btn-main" onClick={checkin} disabled={checking}>
            {checking ? "打卡中…" : "✓ 完成打卡"}
          </button>
          <button className="btn btn-indigo" onClick={() => switchDur(sprint)}>
            再冲一轮 · {sprint} 分钟
          </button>
          <button
            className="btn btn-ghost"
            style={{ color: "#C7CDF7" }}
            onClick={() => {
              showToast("启动过就是胜利 🌱 明天见");
              onClose();
            }}
          >
            到此为止,今天已经赢了
          </button>
        </div>
      )}
    </div>
  );
}
