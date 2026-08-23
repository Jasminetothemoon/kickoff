"use client";
// 启动前情绪检查:四个情绪 chip,选中态 + 一句接纳型文案
const MOODS = ["还行", "焦虑", "累", "不知道从哪开始"];

const COPY: Record<string, string> = {
  还行: "很好!那只用 2 分钟把它收掉,保持手感。",
  焦虑: "焦虑很正常 — 拖延本质是情绪调节,不是懒。我们先把任务变小,情绪就会跟着变小。",
  累: "收到。已把今晚任务切成 3 个 2 分钟微步骤,做完第一个就休息。",
  不知道从哪开始: "这正是 Spark 的主场 — 点右下角的对话球,我把第一步切给你。",
};

export default function MoodCheck({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (mood: string) => void;
}) {
  return (
    <div className="card">
      <span className="tag t-amber">启动前情绪检查</span>
      <h3 style={{ marginTop: 6 }}>想到今天的任务,你现在感觉?</h3>
      <div className="mood">
        {MOODS.map((m) => (
          <span
            key={m}
            className={value === m ? "on" : ""}
            role="button"
            tabIndex={0}
            aria-pressed={value === m}
            onClick={() => onChange(m)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onChange(m);
            }}
          >
            {m}
          </span>
        ))}
      </div>
      <div className="sub" style={{ marginTop: 8 }}>
        {value && COPY[value] ? COPY[value] : "没有错误答案 — 情绪不是敌人,是数据"}
      </div>
    </div>
  );
}
