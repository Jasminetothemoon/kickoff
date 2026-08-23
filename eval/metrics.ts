// Kickoff 评测指标库(纯函数)
// 输入:SimDay[](即 data/simulated/generate.ts 产出的 seed.json 的 days 字段)
// 约定:所有函数无 IO、无随机、无全局状态,对同一输入返回同一结果。
// 类型复用 src/lib/types.ts(Granularity / BlockerType)。

import type { BlockerType, Granularity } from "../src/lib/types";

export type { BlockerType, Granularity } from "../src/lib/types";

/** 画像标识(与 data/simulated/generate.ts 中的三个画像一一对应) */
export type PersonaId = "perfectionist-heavy" | "vague-light" | "adhd-lean";

export const GRANULARITIES: readonly Granularity[] = [2, 5, 10, 15];

// ---------- 数据结构(seed.json 的 TS 视图) ----------

export interface SimTask {
  granularity: Granularity;    // 任务粒度(分钟):2|5|10|15
  started: boolean;            // 是否开始执行
  delayMinutes: number | null; // 提醒→实际开始的延迟(分钟);未开始为 null
  completed: boolean;          // 是否完成(完成必先开始)
  mood: number;                // 自评情绪 1~5
}

export interface SimDay {
  date: string;           // YYYY-MM-DD
  persona: PersonaId;
  tasks: SimTask[];
  blocker: BlockerType;   // 当日卡点判定
}

export interface SimPersonaMeta {
  id: PersonaId;
  label: string;
  description: string;
  activeHours: number[];  // 0~23 活跃时段
}

export interface SimDataset {
  seed: number;
  startDate: string;
  dayCount: number;
  personas: SimPersonaMeta[];
  days: SimDay[];
}

// ---------- 通用辅助 ----------

export function allTasks(days: SimDay[]): SimTask[] {
  return days.flatMap(d => d.tasks);
}

export function sortDaysByDate(days: SimDay[]): SimDay[] {
  return [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function daysOfPersona(days: SimDay[], id: PersonaId): SimDay[] {
  return sortDaysByDate(days.filter(d => d.persona === id));
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// ---------- 指标 1:首次启动率 ----------
// 收到任务(提醒)后 5 分钟内开始执行的任务占比(分母为全部任务)。

export function firstStartRate(days: SimDay[], withinMinutes = 5): number {
  const tasks = allTasks(days);
  if (!tasks.length) return 0;
  const hit = tasks.filter(
    t => t.started && t.delayMinutes !== null && t.delayMinutes <= withinMinutes
  ).length;
  return hit / tasks.length;
}

// ---------- 指标 2:首周完成率 ----------
// 数据内最早 7 个日期(首周)的任务完成占比,对照静态计划基线。

export function week1Completion(days: SimDay[], weekDays = 7): number {
  const dates = [...new Set(days.map(d => d.date))].sort();
  const inWeek = new Set(dates.slice(0, weekDays));
  const tasks = days.filter(d => inWeek.has(d.date)).flatMap(d => d.tasks);
  if (!tasks.length) return 0;
  return tasks.filter(t => t.completed).length / tasks.length;
}

// ---------- 辅助:全期完成率 / 平均启动延迟 ----------

export function completionRate(days: SimDay[]): number {
  const tasks = allTasks(days);
  if (!tasks.length) return 0;
  return tasks.filter(t => t.completed).length / tasks.length;
}

export function avgStartDelay(days: SimDay[]): number | null {
  const delays = allTasks(days)
    .filter(t => t.started && t.delayMinutes !== null)
    .map(t => t.delayMinutes as number);
  return delays.length ? mean(delays) : null;
}

// ---------- 指标 3:启动延迟周环比 ----------
// 按数据顺序每 7 天为一周,汇总已启动任务的平均延迟;
// 负值表示延迟下降(改善)。

export interface WeekDelayStat {
  week: number;              // 1 起
  dayRecords: number;        // 该周记录(天×画像)数
  avgDelayMinutes: number | null;
  wowChangePct: number | null; // 相邻周平均延迟变化 %,负=改善
}

export interface DelayTrend {
  weeks: WeekDelayStat[];
  overallChangePct: number | null; // 末周 vs 首周平均延迟变化 %,负=改善
}

export function startDelayTrend(days: SimDay[]): DelayTrend {
  const sorted = sortDaysByDate(days);
  const dates = [...new Set(sorted.map(d => d.date))].sort();
  const weekOf = new Map<string, number>();
  dates.forEach((d, i) => weekOf.set(d, Math.floor(i / 7)));
  const nWeeks = dates.length ? Math.floor((dates.length - 1) / 7) + 1 : 0;
  const acc = Array.from({ length: nWeeks }, () => ({ sum: 0, count: 0, dayRecords: 0 }));
  for (const d of sorted) {
    const w = weekOf.get(d.date);
    if (w === undefined) continue;
    acc[w].dayRecords += 1;
    for (const t of d.tasks) {
      if (t.started && t.delayMinutes !== null) {
        acc[w].sum += t.delayMinutes;
        acc[w].count += 1;
      }
    }
  }
  const weeks: WeekDelayStat[] = [];
  let prevAvg: number | null = null;
  for (let w = 0; w < nWeeks; w++) {
    const avg = acc[w].count > 0 ? acc[w].sum / acc[w].count : null;
    const wow =
      avg !== null && prevAvg !== null && prevAvg > 0
        ? ((avg - prevAvg) / prevAvg) * 100
        : null;
    weeks.push({ week: w + 1, dayRecords: acc[w].dayRecords, avgDelayMinutes: avg, wowChangePct: wow });
    if (avg !== null) prevAvg = avg;
  }
  const avgs = weeks.map(x => x.avgDelayMinutes).filter((v): v is number => v !== null);
  const overallChangePct =
    avgs.length >= 2 && avgs[0] > 0 ? ((avgs[avgs.length - 1] - avgs[0]) / avgs[0]) * 100 : null;
  return { weeks, overallChangePct };
}

// ---------- 指标 4:粒度自适应提升(重放) ----------
// 规则:从 15 分钟档出发,最近 window 个任务的期望完成率
//   < downBelow → 降一档(2|5|10|15 相邻档位,下限 minGranularity)
//   > upAbove   → 升一档
// 期望值取该画像在各粒度上的经验(观测)完成率/启动率,因此重放是确定性的。
// 对比对象:固定 15 分钟基线(不按画像调粒度)。

export interface AdaptiveUpliftOptions {
  window?: number;          // 滑动窗口任务数,默认 4
  downBelow?: number;       // 降档阈值,默认 0.5
  upAbove?: number;         // 升档阈值,默认 0.8
  minGranularity?: Granularity; // 可用最小粒度(消融"无专注支持"时设为 5)
}

export interface AdaptiveUpliftResult {
  taskCount: number;
  fixedStartRate: number;         // 固定 15 分钟:期望启动率
  adaptiveStartRate: number;      // 自适应重放:期望启动率
  fixedCompletionRate: number;    // 固定 15 分钟:期望完成率
  adaptiveCompletionRate: number; // 自适应重放:期望完成率
  completionUpliftPP: number;     // 完成率差(百分点,自适应 − 固定)
  completionUpliftRelPct: number; // 完成率相对提升 %(固定>0 时有效)
  finalGranularity: Granularity; // 重放结束时所处档位
  adaptiveGranShares: Record<Granularity, number>; // 自适应重放中各档位承接的任务占比
}

interface GranStat {
  total: number;
  started: number;
  completed: number;
}

function granStats(days: SimDay[]): Map<Granularity, GranStat> {
  const m = new Map<Granularity, GranStat>();
  for (const g of GRANULARITIES) m.set(g, { total: 0, started: 0, completed: 0 });
  for (const d of days) {
    for (const t of d.tasks) {
      const s = m.get(t.granularity);
      if (s) {
        s.total += 1;
        if (t.started) s.started += 1;
        if (t.completed) s.completed += 1;
      }
    }
  }
  return m;
}

/** 取某档位的经验比率;该档无样本时回落到粒度最近的档位;全空返回 0 */
function rateAt(
  stats: Map<Granularity, GranStat>,
  key: "started" | "completed",
  gran: Granularity
): number {
  const direct = stats.get(gran);
  if (direct && direct.total > 0) return direct[key] / direct.total;
  const withSamples = GRANULARITIES.filter(g => (stats.get(g)?.total ?? 0) > 0).sort(
    (a, b) => Math.abs(a - gran) - Math.abs(b - gran)
  );
  const nearest = withSamples[0];
  const s = nearest !== undefined ? stats.get(nearest) : undefined;
  return s && s.total > 0 ? s[key] / s.total : 0;
}

export function adaptiveUplift(days: SimDay[], options: AdaptiveUpliftOptions = {}): AdaptiveUpliftResult {
  const windowSize = options.window ?? 4;
  const downBelow = options.downBelow ?? 0.5;
  const upAbove = options.upAbove ?? 0.8;
  const minGran = options.minGranularity ?? 2;
  const minIdx = GRANULARITIES.indexOf(minGran);

  const sorted = sortDaysByDate(days);
  const stats = granStats(sorted);
  const tasks = allTasks(sorted);

  let current: Granularity = 15;
  const history: number[] = [];   // 滑动窗口内的期望完成率
  const startExpect: number[] = [];
  const compExpect: number[] = [];
  const granCounts: Record<Granularity, number> = { 2: 0, 5: 0, 10: 0, 15: 0 };

  for (const _task of tasks) {
    granCounts[current] += 1;
    const s = rateAt(stats, "started", current);
    const c = rateAt(stats, "completed", current);
    startExpect.push(s);
    compExpect.push(c);
    history.push(c);
    if (history.length >= windowSize) {
      const recent = history.slice(-windowSize);
      const m = mean(recent);
      const idx = GRANULARITIES.indexOf(current);
      if (m < downBelow && idx > minIdx) {
        current = GRANULARITIES[idx - 1];
      } else if (m > upAbove && idx < GRANULARITIES.length - 1) {
        current = GRANULARITIES[idx + 1];
      }
    }
  }

  const n = Math.max(tasks.length, 1);
  const fixedCompletionRate = rateAt(stats, "completed", 15);
  const adaptiveCompletionRate = mean(compExpect);
  return {
    taskCount: tasks.length,
    fixedStartRate: rateAt(stats, "started", 15),
    adaptiveStartRate: mean(startExpect),
    fixedCompletionRate,
    adaptiveCompletionRate,
    completionUpliftPP: (adaptiveCompletionRate - fixedCompletionRate) * 100,
    completionUpliftRelPct:
      fixedCompletionRate > 0 ? (adaptiveCompletionRate / fixedCompletionRate - 1) * 100 : 0,
    finalGranularity: current,
    adaptiveGranShares: {
      2: granCounts[2] / n,
      5: granCounts[5] / n,
      10: granCounts[10] / n,
      15: granCounts[15] / n,
    },
  };
}
