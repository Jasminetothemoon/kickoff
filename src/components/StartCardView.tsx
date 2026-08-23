"use client";
// 今日启动卡:第一步 + 预计分钟 + 完成标准 + 执行意图 + 主/次按钮
import AgentAvatar from "./AgentAvatar";
import type { StartCard } from "@/lib/types";

export default function StartCardView({
  card,
  onStart,
  onSmaller,
  busy = false,
  link,
  linkTitle,
}: {
  card: StartCard;
  onStart: () => void;
  onSmaller: () => void;
  busy?: boolean;
  link?: string;
  linkTitle?: string;
}) {
  return (
    <div className="card" style={{ borderLeft: "4px solid var(--orange)" }}>
      <span
        className="tag t-orange"
        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        <AgentAvatar agent="Spark" size={16} />
        今日启动卡 · Spark 生成
      </span>
      <div className="step-big">
        <div className="step-num">1</div>
        <div>
          <div className="step-txt">{card.firstStep}</div>
          <div className="step-meta">
            预计 {card.minutes} 分钟 · 完成标准:{card.doneCriteria}
          </div>
        </div>
      </div>
      {link && (
        <a className="resource-link" href={link} target="_blank" rel="noreferrer">
          📎 {linkTitle || link}
        </a>
      )}
      <button className="btn btn-main" onClick={onStart}>
        只做 2 分钟,现在开始
      </button>
      <button className="btn btn-ghost" onClick={onSmaller} disabled={busy}>
        {busy ? "Spark 正在换更小的步骤…" : "还是太难?换一个更小的步骤"}
      </button>
      <div className="intent" style={{ marginTop: 10 }}>
        🗒 执行意图:{card.intent}
      </div>
    </div>
  );
}
