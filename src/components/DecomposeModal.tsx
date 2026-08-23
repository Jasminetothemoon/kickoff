"use client";
// Spark 拆解对话模态:输入"把这个拆了" + 细度滑块(极细/细/中/粗)
// 调 POST /api/decompose 渲染步骤列表(第一步高亮);失败时本地演示数据兜底
import { useEffect, useState } from "react";
import type { DecomposeResult } from "@/lib/types";
import { GRAN_LABELS, GRAN_MINUTES, demoDecompose, postJson } from "./data";
import { showToast } from "./Toast";

export default function DecomposeModal({
  open,
  onClose,
  mood,
}: {
  open: boolean;
  onClose: () => void;
  mood?: string | null;
}) {
  const [raw, setRaw] = useState("");
  const [level, setLevel] = useState(2); // 1=极细 2=细 3=中 4=粗
  const [result, setResult] = useState<DecomposeResult | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    let next: DecomposeResult | null = null;
    let fallback = false;
    try {
      next = await postJson<DecomposeResult>("/api/decompose", {
        rawTask: raw.trim() || "一直没动笔的作业",
        mood: mood ?? undefined,
        granularity: GRAN_MINUTES[level - 1],
      });
      if (!next || !Array.isArray(next.steps) || next.steps.length === 0) throw new Error("empty");
    } catch {
      next = demoDecompose(raw, level);
      fallback = true;
    }
    setResult(next);
    setBusy(false);
    showToast(fallback ? "Spark 离线中 — 已用演示拆解" : "拆好了 — 从高亮的第一步开始");
  };

  return (
    <div className="modal-mask" onClick={onClose} role="dialog" aria-modal="true" aria-label="Spark 拆解对话">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="row">
          <b className="sheet-title">🧩 Spark · 把大象装进冰箱</b>
          <button className="x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="park">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="把这个拆了 — 例如:下周要交作业,一直没动笔…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) submit();
            }}
          />
          <button onClick={submit} disabled={busy}>
            {busy ? "拆解中…" : "拆!"}
          </button>
        </div>

        <div className="card" style={{ boxShadow: "none" }}>
          <div className="slider">
            <span>拆解细度</span>
            <input
              type="range"
              min={1}
              max={4}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              aria-label="拆解细度"
            />
            <span style={{ color: "var(--orange)", fontWeight: 700 }}>{GRAN_LABELS[level - 1]}</span>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            觉得难就往左拉 —— 每一步都可以继续再拆,直到「现在就能做」
          </div>
        </div>

        {result && (
          <>
            <div className="chat">
              <div className="bubble ai">{result.empathy}</div>
            </div>
            <ul className="steps">
              {result.steps.map((s, i) => (
                <li key={i} className={i === 0 ? "first" : ""}>
                  <span className="dot">{i === 0 ? "▶" : i + 1}</span>
                  {s.title}
                  <span className="m">{s.minutes} 分钟</span>
                </li>
              ))}
            </ul>
            <div className="card" style={{ boxShadow: "none" }}>
              <span className="tag t-orange">卡点诊断</span>
              <h3 style={{ margin: "6px 0 4px" }}>{result.blocker}</h3>
              <div className="sub">
                对策:「烂开始」— 先交 60 分草稿,再迭代。
                <b>证据强度:中-强(完美主义研究 / CBT)</b>
              </div>
            </div>
            <div className="intent">
              🗒 第一步:{result.startCard?.firstStep}(预计 {result.startCard?.minutes ?? 2} 分钟)— 回「今天」页直接开始
            </div>
          </>
        )}
      </div>
    </div>
  );
}
