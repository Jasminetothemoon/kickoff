"use client";
// 今日启动卡:第一步 + 预计分钟 + 完成标准 + 执行意图 + 主/次按钮
// Spark 头像置于 tag 行左侧:启动卡内容(firstStep)变化时做一次 pop 入场强调
import AgentAvatar from "./AgentAvatar";
import type { StartCard } from "@/lib/types";

// 入场强调动画:scale 0.6 → 1.1 → 1(仅装饰,AgentAvatar 本体动画不受影响)
const SPARK_POP_STYLE = `
@keyframes kickoff-spark-pop {
  0% { transform: scale(0.6); }
  55% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
.kickoff-spark-pop { animation: kickoff-spark-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
@media (prefers-reduced-motion: reduce) {
  .kickoff-spark-pop { animation: none; }
}
`;

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
      <style>{SPARK_POP_STYLE}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* key 绑定 firstStep:换更小步骤/新卡时重挂载,重放一次 pop 强调 */}
        <span key={card.firstStep} className="kickoff-spark-pop">
          <AgentAvatar agent="Spark" size={30} />
        </span>
        <span className="tag t-orange">今日启动卡 · Spark 生成</span>
      </div>
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
