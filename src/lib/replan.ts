// 重规划引擎:把 Mirror 复盘的 planAdjustments 真正落到 Plan 里(M2「会学习」闭环的核心)
// 打卡事件 → Mirror 归因 → 画像更新 → [这里] Coach 重排 → Pace 调整提醒强度
import { prisma } from "./db";
import { loadPlansForGoal, type StoredPlan } from "./planStore";
import { getProfile, suggestGranularity } from "./profile";
import { todayStr } from "./datetime";
import type { Granularity, TaskItem } from "./types";

export interface PlanAdjustment {
  kind: "reduce" | "granularity" | "reschedule";
  note: string;
}

export interface ReplanOutcome {
  applied: string[]; // 人类可读的变更摘要
  changedTasks: number;
}

const WEEKDAY_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const GRAN_CAP: Record<Granularity, number> = { 2: 2, 5: 5, 10: 10, 15: 15 };

function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getDay();
}

/** 对最新目标执行一组调整;幂等(重复执行不会再改已改过的任务) */
export async function applyPlanAdjustments(
  userId: string,
  adjustments: PlanAdjustment[]
): Promise<ReplanOutcome> {
  const applied: string[] = [];
  let changedTasks = 0;
  if (adjustments.length === 0) return { applied, changedTasks };

  const goal = await prisma.goal.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!goal) return { applied, changedTasks };

  const plans = await loadPlansForGoal(goal.id);
  if (plans.length === 0) return { applied, changedTasks };
  const today = todayStr();

  let suggested: Granularity | null = null;
  let lowDays: number[] = [];
  try {
    const dual = await getProfile(userId);
    suggested = suggestGranularity(dual.procrastination);
    lowDays = dual.procrastination.lowDays ?? [];
  } catch {
    // 画像不可用时仅执行 reschedule
  }

  const dirty = new Set<string>(); // 被修改过的 plan id
  const kinds = new Set(adjustments.map((a) => a.kind));

  // 1) 粒度下调:当前/未来周中,未完成且粒度高于建议值的任务 → 降到建议粒度
  if (kinds.has("granularity") && suggested !== null) {
    let n = 0;
    for (const p of plans) {
      let touched = false;
      for (const day of p.days) {
        if (day.date < today) continue;
        for (const t of day.tasks) {
          if (!t.done && t.granularity > suggested) {
            t.granularity = suggested;
            t.minutes = Math.min(t.minutes, GRAN_CAP[suggested]);
            n += 1;
            touched = true;
          }
        }
      }
      if (touched) dirty.add(p.id);
    }
    if (n > 0) {
      changedTasks += n;
      applied.push(`已将 ${n} 个未完成任务的粒度下调至 ${suggested} 分钟(按你的启动成功率自适应)`);
    }
  }

  // 2) 低谷日减载:低谷周几的未完成日,任务多于 1 个时只保留最短的 1 个
  if (kinds.has("reduce") && lowDays.length > 0) {
    let n = 0;
    for (const p of plans) {
      let touched = false;
      for (const day of p.days) {
        if (day.date < today) continue;
        if (!lowDays.includes(weekdayOf(day.date))) continue;
        const undone = day.tasks.filter((t) => !t.done);
        if (undone.length > 1) {
          const keep = undone.reduce((a, b) => (a.minutes <= b.minutes ? a : b));
          for (const t of undone) {
            if (t !== keep) {
              day.tasks = day.tasks.filter((x) => x !== t);
              n += 1;
            }
          }
          touched = true;
        }
      }
      if (touched) dirty.add(p.id);
    }
    if (n > 0) {
      changedTasks += n;
      const names = lowDays.map((d) => WEEKDAY_CN[d] ?? `${d}`).join("/");
      applied.push(`低谷日(${names})已减载:顺延移除 ${n} 个任务,只保留每天 1 个最小任务`);
    }
  }

  // 3) 过期任务顺延:今天之前未完成的任务,移到今天起任务最少的日子
  if (kinds.has("reschedule")) {
    const overdue: TaskItem[] = [];
    for (const p of plans) {
      let touched = false;
      for (const day of p.days) {
        if (day.date >= today) continue;
        const undone = day.tasks.filter((t) => !t.done);
        if (undone.length > 0) {
          day.tasks = day.tasks.filter((t) => t.done);
          overdue.push(...undone);
          touched = true;
        }
      }
      if (touched) dirty.add(p.id);
    }
    if (overdue.length > 0) {
      // 收集今天起的"未来日"引用,按任务数升序摊入
      const future: { plan: StoredPlan; day: DayRef }[] = [];
      for (const p of plans) {
        for (const day of p.days) {
          if (day.date >= today) future.push({ plan: p, day });
        }
      }
      future.sort((a, b) => a.day.tasks.length - b.day.tasks.length);
      let moved = 0;
      for (const t of overdue) {
        const slot = future[moved % Math.max(1, future.length)];
        if (!slot) break;
        slot.day.tasks.push({ ...t, granularity: 2, minutes: Math.min(t.minutes, 2), done: false });
        dirty.add(slot.plan.id);
        moved += 1;
      }
      if (moved > 0) {
        changedTasks += moved;
        applied.push(`${moved} 个过期未完成任务已顺延,并压回 2 分钟微启动粒度`);
      }
    }
  }

  // 回写被修改的周
  for (const p of plans) {
    if (dirty.has(p.id)) {
      await prisma.plan.update({
        where: { id: p.id },
        data: { days: JSON.stringify(p.days) },
      });
    }
  }

  return { applied, changedTasks };
}

interface DayRef {
  date: string;
  tasks: TaskItem[];
}
