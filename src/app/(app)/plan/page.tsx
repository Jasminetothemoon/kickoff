"use client";
// 「计划」:本周 focus + 7 天任务(打勾切换为本地状态,低谷日标注「已减载」)
import { useCallback, useEffect, useState } from "react";
import type { WeekPlan } from "@/lib/types";
import { WEEKDAY_CN, buildDemoWeek, fmtDate, fmtMD } from "@/components/data";
import GoalWizard from "@/components/GoalWizard";

// Monday-first 下标:1=周二 3=周四(与画像 lowDays=[2,4](0=周日)一致)
const LOW_DAY_IDX = [1, 3];

export default function PlanPage() {
  const [week, setWeek] = useState<WeekPlan>(() => buildDemoWeek());
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const todayStr = fmtDate(new Date());

  const loadPlan = useCallback(async () => {
    try {
      const r = await fetch("/api/plans");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d?.week && Array.isArray(d.week.days)) {
        setWeek(d.week as WeekPlan);
      }
    } catch {
      // 演示数据兜底
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const toggleTask = (dayIdx: number, taskId: string) => {
    setWeek((w) => ({
      ...w,
      days: w.days.map((d, i) =>
        i === dayIdx
          ? { ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) }
          : d,
      ),
    }));
  };

  const done = week.days.reduce((n, d) => n + d.tasks.filter((t) => t.done).length, 0);
  const total = week.days.reduce((n, d) => n + d.tasks.length, 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 2 }}>
        <div className="hello">
          Coach · 自适应计划
          <b>{week.focus}</b>
        </div>
        <button
          className="tag t-indigo"
          style={{
            border: "1px solid var(--indigo)",
            cursor: "pointer",
            padding: "6px 12px",
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            flex: "none",
            marginTop: 4,
            fontWeight: 600,
          }}
          onClick={() => setWizardOpen(true)}
          title="导入自定义学习目标与资源"
        >
          ✦ 新建/导入目标
        </button>
      </div>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "42%", height: 12, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "70%" }} />
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: "center" }}>
          <span className="tag t-indigo">本周重点 · 第 {week.week} 周</span>
          <button
            style={{
              background: "transparent",
              border: "none",
              color: "var(--indigo)",
              fontSize: "11px",
              cursor: "pointer",
              fontWeight: 600,
              padding: "2px 6px",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
            onClick={() => setWizardOpen(true)}
          >
            + 更换/导入目标
          </button>
        </div>
        <h3>{week.focus}</h3>
        <div className="timebar">
          <div className="cap">
            <span>周进度</span>
            <span>
              {done} / {total} 项
            </span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {week.days.map((d, i) => {
        const isToday = d.date === todayStr;
        const isLow = LOW_DAY_IDX.includes(i);
        return (
          <div key={d.date} className={"card" + (isToday ? " today-card" : "")}>
            <div className="row">
              <h3 style={{ margin: 0 }}>
                {WEEKDAY_CN[i]} · {fmtMD(d.date)}
              </h3>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                {isToday && <span className="tag t-indigo">今天</span>}
                {isLow && <span className="tag t-amber">低谷日 · 已减载</span>}
              </div>
            </div>
            {d.tasks.length === 0 ? (
              <div className="sub mt6">休息 · 弹性缓冲日,不排任务</div>
            ) : (
              d.tasks.map((t) => (
                <div
                  key={t.id}
                  className={"task" + (t.done ? " done" : "")}
                  role="button"
                  tabIndex={0}
                  aria-pressed={t.done}
                  onClick={() => toggleTask(i, t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleTask(i, t.id);
                  }}
                >
                  <span className="tick" aria-hidden="true">
                    {t.done ? "✓" : ""}
                  </span>
                  <div>
                    <div className="t-title">{t.title}</div>
                    <div className="step-meta">
                      {t.minutes} 分钟 · 粒度 {t.granularity}m{t.done ? " · 已完成" : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}

      <div className="sub center">轻量周视图 · Coach 会按你的画像自动减载与调粒度,无需手动排甘特图</div>

      <GoalWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setLoading(true);
          loadPlan();
        }}
      />
    </>
  );
}
