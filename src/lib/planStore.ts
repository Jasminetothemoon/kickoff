// Plan.days(SQLite 里的 JSON 字符串)读写:读出后 JSON.parse + zod 容错校验
import { z } from "zod";
import { prisma } from "./db";
import type { DayPlan, Granularity, TaskItem } from "./types";

const storedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  minutes: z.number().int().min(1),
  granularity: z
    .number()
    .int()
    .transform((v) => (v === 2 || v === 5 || v === 10 || v === 15 ? v : 2) as Granularity),
  done: z.boolean().default(false),
  link: z.string().optional(),
  linkTitle: z.string().optional(),
});
const storedDaySchema = z.object({
  date: z.string().min(8),
  tasks: z.array(storedTaskSchema).default([]),
});

/** 解析 Plan.days;损坏/不合法 → 返回 [](不抛错,单周数据损坏不影响其余周) */
export function parsePlanDays(raw: string): DayPlan[] {
  try {
    const v: unknown = JSON.parse(raw);
    const parsed = z.array(storedDaySchema).safeParse(v);
    if (parsed.success) return parsed.data;
  } catch {
    // fallthrough
  }
  return [];
}

export interface StoredPlan {
  id: string;
  goalId: string;
  week: number;
  focus: string;
  days: DayPlan[];
}

export async function loadPlansForGoal(goalId: string): Promise<StoredPlan[]> {
  const rows = await prisma.plan.findMany({ where: { goalId }, orderBy: { week: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goalId,
    week: r.week,
    focus: r.focus,
    days: parsePlanDays(r.days),
  }));
}

export interface TaskRef {
  planId: string;
  week: number;
  task: TaskItem;
}

export async function findTaskInGoal(goalId: string, taskId: string): Promise<TaskRef | null> {
  for (const p of await loadPlansForGoal(goalId)) {
    for (const day of p.days) {
      const t = day.tasks.find((x) => x.id === taskId);
      if (t) return { planId: p.id, week: p.week, task: t };
    }
  }
  return null;
}

/** 打卡后把对应任务标记 done 并回写 JSON */
export async function markTaskDone(goalId: string, taskId: string): Promise<TaskItem | null> {
  const plans = await loadPlansForGoal(goalId);
  for (const p of plans) {
    for (const day of p.days) {
      const t = day.tasks.find((x) => x.id === taskId);
      if (t) {
        t.done = true;
        await prisma.plan.update({
          where: { id: p.id },
          data: { days: JSON.stringify(p.days) },
        });
        return t;
      }
    }
  }
  return null;
}
