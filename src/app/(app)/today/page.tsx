"use client";
// 「今天」:目标空态(向导 CTA)/ 启动卡 / 倒计时打卡 / 情绪检查 / Coach 周进度 / 拆解对话球
import { useCallback, useEffect, useRef, useState } from "react";
import type { DecomposeResult, StartCard, TaskItem } from "@/lib/types";
import StartCardView from "@/components/StartCardView";
import CountdownTimer from "@/components/CountdownTimer";
import MoodCheck from "@/components/MoodCheck";
import FloatingBall from "@/components/FloatingBall";
import GoalWizard from "@/components/GoalWizard";
import {
  DEMO_FOCUS,
  DEMO_START_CARD,
  DEMO_TASK,
  DEMO_WEEK_PROGRESS,
  SMALLER_STEPS,
  loadSettings,
  postJson,
} from "@/components/data";
import { showToast } from "@/components/Toast";

type TodayApi = {
  task: TaskItem | null;
  startCard: StartCard | null;
  weekProgress: { done: number; total: number };
  today: string;
  hasGoal?: boolean;
  goalTitle?: string | null;
  weekFocus?: string | null;
  streak?: number;
  startedToday?: boolean;
  invite?: { title: string; body: string } | null; // 活跃时段且今日未启动时的邀约文案
  streakFrozen?: boolean; // 昨日断签已自动宽恕
  freshStartAvailable?: boolean; // 有历史打卡但 streak=0,可重新开始
};

// 成就契约(后端并行实现;任何失败均静默降级,不影响今天页)
type NewAchievement = { key: string; title: string; icon: string };
type AchievementsApi = {
  points: number;
  unlocked: { key: string; title: string; icon: string; unlockedAt?: string }[];
};
const ACH_EVENT = "kickoff:achievements"; // 打卡/冲刺响应里的 newAchievements 由触发方 dispatch
const ACH_SEEN_KEY = "kickoff.ach_seen"; // localStorage 已见成就缓存(跨会话去重)
const ACH_TOAST_GAP = 2000; // toast 单条显示约 2.6s,多枚成就逐条排队展示

function greeting(): string {
  const now = new Date();
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  const h = now.getHours();
  const slot = h < 6 ? "凌晨" : h < 11 ? "早晨" : h < 14 ? "午间" : h < 18 ? "下午" : h < 23 ? "晚间" : "深夜";
  return `${wd} · ${slot}学习时段`;
}

export default function TodayPage() {
  const [loading, setLoading] = useState(true);
  const [hasGoal, setHasGoal] = useState(true);
  const [goalTitle, setGoalTitle] = useState<string | null>(null);
  const [weekFocus, setWeekFocus] = useState<string | null>(null);
  const [task, setTask] = useState<TaskItem | null>(DEMO_TASK);
  const [card, setCard] = useState<StartCard>(DEMO_START_CARD);
  const [prog, setProg] = useState<{ done: number; total: number }>(DEMO_WEEK_PROGRESS);
  const [mood, setMood] = useState<string | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [smallerBusy, setSmallerBusy] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [singleView, setSingleView] = useState(false);
  const [streak, setStreak] = useState(0);
  const [startedToday, setStartedToday] = useState(false);
  const [invite, setInvite] = useState<{ title: string; body: string } | null>(null);
  const [inviteDismissed, setInviteDismissed] = useState(false); // 「今天先不了」:本地关闭横幅
  const [streakFrozen, setStreakFrozen] = useState(false);
  const [freshStartAvailable, setFreshStartAvailable] = useState(false);
  const [freshBusy, setFreshBusy] = useState(false);
  const autoCardDone = useRef(false);
  const achSeenKeys = useRef<Set<string> | null>(null); // 本会话已庆祝过的成就 key,防重复 toast
  const achTimers = useRef<ReturnType<typeof setTimeout>[]>([]); // 排队中的成就 toast 定时器

  // 逐条庆祝新解锁成就:toast 一次只显示一条,多条按间隔排队;会话内按 key 去重
  const announceAchievements = useCallback((list: NewAchievement[]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    if (!achSeenKeys.current) achSeenKeys.current = new Set<string>();
    const seen = achSeenKeys.current;
    const fresh = list.filter(
      (a) => a && typeof a.key === "string" && typeof a.title === "string" && !seen.has(a.key),
    );
    fresh.forEach((a, i) => {
      seen.add(a.key);
      achTimers.current.push(
        setTimeout(() => showToast(`🎉 解锁成就 ${a.icon || "🏅"} ${a.title}`), i * ACH_TOAST_GAP),
      );
    });
  }, []);

  // 成就同步:load() 时顺带拉取,与 localStorage 已见缓存比对,新 key → toast 庆祝并更新缓存;
  // 首次(无缓存)只建缓存不打扰;接口失败静默
  const syncAchievements = useCallback(() => {
    fetch("/api/achievements")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AchievementsApi) => {
        const unlocked = d?.unlocked;
        if (!Array.isArray(unlocked)) return;
        const keys = unlocked
          .map((a) => (a && typeof a.key === "string" ? a.key : ""))
          .filter((k) => k !== "");
        let cached: string[] | null = null;
        try {
          const raw = localStorage.getItem(ACH_SEEN_KEY);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) cached = parsed.filter((k): k is string => typeof k === "string");
          }
        } catch {
          cached = null; // 缓存损坏:当作首次,静默重建
        }
        try {
          localStorage.setItem(ACH_SEEN_KEY, JSON.stringify(keys));
        } catch {
          // localStorage 不可用:跳过持久化,仅会话内去重
        }
        if (!cached) return;
        const cachedSet = new Set(cached);
        const fresh: NewAchievement[] = [];
        for (const a of unlocked) {
          if (a && typeof a.key === "string" && typeof a.title === "string" && !cachedSet.has(a.key)) {
            fresh.push({ key: a.key, title: a.title, icon: typeof a.icon === "string" ? a.icon : "" });
          }
        }
        if (fresh.length > 0) announceAchievements(fresh);
      })
      .catch(() => {
        // 成就接口不可用:静默降级
      });
  }, [announceAchievements]);

  const load = useCallback(async () => {
    syncAchievements(); // 顺带同步成就:新解锁的会逐条 toast 庆祝(失败静默)
    try {
      const r = await fetch("/api/today");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: TodayApi = await r.json();
      if (!d) return;
      setHasGoal(d.hasGoal !== false);
      if (d.goalTitle) setGoalTitle(d.goalTitle);
      if (d.weekFocus) setWeekFocus(d.weekFocus);
      if (d.task) setTask(d.task);
      if (d.startCard) {
        setCard(d.startCard);
      } else if (d.task && !autoCardDone.current) {
        // 有任务但还没有启动卡:让 Spark 自动拆出第一步(仅一次)
        autoCardDone.current = true;
        try {
          const res = await postJson<DecomposeResult>("/api/decompose", {
            taskId: d.task.id,
            rawTask: d.task.title,
          });
          if (res?.startCard?.firstStep) setCard(res.startCard);
        } catch {
          // 保留演示卡,不阻塞主流程
        }
      }
      if (d.weekProgress && typeof d.weekProgress.total === "number" && d.weekProgress.total > 0) {
        setProg(d.weekProgress);
      }
      if (typeof d.streak === "number") setStreak(d.streak);
      if (typeof d.startedToday === "boolean") setStartedToday(d.startedToday);
      setInvite(d.invite ?? null); // 启动后服务端不再下发,横幅自动消失
      setStreakFrozen(d.streakFrozen === true);
      setFreshStartAvailable(d.freshStartAvailable === true);
    } catch {
      // API 不可用:保留演示数据,页面独立可看
    } finally {
      setLoading(false);
    }
  }, [syncAchievements]);

  useEffect(() => {
    let alive = true;
    setSingleView(loadSettings().singleTaskView);
    load().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  // 成就庆祝事件:打卡/冲刺响应中的 newAchievements(契约字段)由后续接线方以
  // window.dispatchEvent(new CustomEvent("kickoff:achievements", { detail })) 派发;
  // 这里只负责监听并逐条 toast 展示
  useEffect(() => {
    const onAchievements = (e: Event) => {
      const detail = (e as CustomEvent<NewAchievement[]>).detail;
      if (Array.isArray(detail)) announceAchievements(detail);
    };
    window.addEventListener(ACH_EVENT, onAchievements);
    return () => {
      window.removeEventListener(ACH_EVENT, onAchievements);
      achTimers.current.forEach((t) => clearTimeout(t));
      achTimers.current = [];
    };
  }, [announceAchievements]);

  const handleSmaller = async () => {
    setSmallerBusy(true);
    try {
      const res = await postJson<DecomposeResult>("/api/decompose", {
        taskId: task?.id,
        rawTask: card.firstStep,
        mood: mood ?? undefined,
      });
      if (res?.startCard?.firstStep) {
        setCard(res.startCard);
        showToast("已换到更小的步骤 — 现在只需要 1 个动作");
      } else {
        throw new Error("empty");
      }
    } catch {
      const next = Math.min(stepIdx + 1, SMALLER_STEPS.length - 1);
      if (next === stepIdx) {
        showToast("已经是宇宙最小步骤了 — 30 秒也算开始,直接上吧");
      } else {
        setStepIdx(next);
        setCard(SMALLER_STEPS[next]);
        showToast("已换到更小的步骤(演示数据)");
      }
    } finally {
      setSmallerBusy(false);
    }
  };

  // 重新开始:清零重来,成功后用后端文案 toast 并刷新今日数据
  const handleFreshStart = async () => {
    if (freshBusy) return;
    setFreshBusy(true);
    try {
      const res = await postJson<{ ok: boolean; message: string }>("/api/fresh-start", {});
      showToast(res?.message || "🌱 全新的开始 — 过去清零,今天算第 1 天");
      await load();
    } catch {
      showToast("网络不太顺畅,重新开始稍后再试 — 今天依然算数");
    } finally {
      setFreshBusy(false);
    }
  };

  const pct = prog.total > 0 ? Math.round((prog.done / prog.total) * 100) : 0;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", marginBottom: 2 }}>
        <div className="hello">
          {greeting()}
          <b>现在,只需要迈出第一步</b>
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

      {!loading && (startedToday || streak > 0) && (
        <div className={"statusline" + (startedToday ? " ok" : "")}>
          {startedToday ? "✓ 今日已启动" : "今天还没开始 — 只差 2 分钟"}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}>
            {streak > 0 && <b>🔥 连续 {streak} 天</b>}
            {streakFrozen && (
              <span
                title="昨日断签已宽恕,连续记录保留"
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: startedToday ? "rgba(13,148,136,.12)" : "rgba(138,147,168,.15)",
                  color: startedToday ? "var(--teal)" : "var(--muted)",
                }}
              >
                🧊 已自动宽恕
              </span>
            )}
          </span>
        </div>
      )}

      {/* 活跃时段邀约:今日未启动时由后端下发;「今天先不了」仅本地关闭 */}
      {!loading && invite && !inviteDismissed && (
        <div
          className="card fade-in"
          style={{ borderLeft: "4px solid var(--orange)", boxShadow: "0 8px 20px rgba(232,112,26,.12)" }}
        >
          <b style={{ fontSize: 14.5, color: "var(--ink)", display: "block", lineHeight: 1.4 }}>{invite.title}</b>
          <div className="sub" style={{ marginTop: 4 }}>
            {invite.body}
          </div>
          <button className="btn btn-main mt10" onClick={() => setTimerOpen(true)}>
            ▶ 现在开始(只要 2 分钟)
          </button>
          <button className="btn btn-ghost" onClick={() => setInviteDismissed(true)}>
            今天先不了
          </button>
        </div>
      )}

      {!loading && freshStartAvailable && (
        <button
          onClick={handleFreshStart}
          disabled={freshBusy}
          title="连续记录已清零 — 清空旧记录,从今天重新开始"
          style={{
            alignSelf: "center",
            flex: "none",
            border: "1px dashed var(--line)",
            background: "transparent",
            color: "var(--muted)",
            borderRadius: 999,
            padding: "5px 14px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🌱 {freshBusy ? "重置中…" : "重新开始"}
        </button>
      )}

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "42%", height: 12, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "88%", marginBottom: 8 }} />
          <div className="skeleton" style={{ width: "60%" }} />
        </div>
      )}

      {!loading && !hasGoal && (
        <div className="card hero-cta">
          <span className="tag t-amber">开始之前</span>
          <h3>创建你的第一个学习目标</h3>
          <div className="sub">
            {goalTitle ? `已有一个目标:${goalTitle}` : "一句话写下你想学什么,Coach 会生成完整计划 —— 首周自动压载,今天只要 2 分钟"}
          </div>
          <button className="btn btn-main mt10" onClick={() => setWizardOpen(true)}>
            ✦ 生成我的学习计划
          </button>
          <div className="sub mt6 center">下方为演示数据,创建后立即替换为你的真实计划</div>
        </div>
      )}

      <StartCardView
        card={card}
        onStart={() => setTimerOpen(true)}
        onSmaller={handleSmaller}
        busy={smallerBusy}
        link={task?.link}
        linkTitle={task?.linkTitle}
      />

      {singleView ? (
        <div className="sub center">
          已开启单任务视图 — 只专注眼前这一步(可在「设置」中关闭)
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row" style={{ alignItems: "center" }}>
              <span className="tag t-indigo">Coach · 本周计划(自适应后)</span>
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
            <h3>{weekFocus ?? DEMO_FOCUS}</h3>
            <div className="sub">
              {goalTitle ? `目标:${goalTitle} — 低谷日自动减载,粒度随启动成功率自适应` : "周二/周四为你的低谷日,任务已自动减半;周三将试探 10 分钟任务"}
            </div>
            <div className="timebar">
              <div className="cap">
                <span>周进度</span>
                <span>
                  {prog.done} / {prog.total} 项
                </span>
              </div>
              <div className="track">
                <div className="fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <MoodCheck value={mood} onChange={setMood} />
        </>
      )}

      <FloatingBall mood={mood} />

      <CountdownTimer
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        taskId={task?.id}
        mood={mood}
        granularity={task?.granularity ?? 2}
        onCheckedIn={() => {
          // 打卡后刷新今日数据:周进度/下一个任务/画像联动
          autoCardDone.current = false;
          setLoading(true);
          load();
        }}
      />

      <GoalWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setLoading(true);
          autoCardDone.current = false;
          load();
        }}
      />
    </>
  );
}
