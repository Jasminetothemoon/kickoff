// zod 校验层:与 src/lib/types.ts 契约一一对应;LLM 输出用宽松版,规范化后再满足严格版
import { z } from "zod";
import type { BlockerType, Granularity } from "./types";

export const BLOCKER_TYPES = [
  "模糊型",
  "畏难型",
  "完美主义型",
  "动力型",
  "环境型",
  "疲劳型",
] as const satisfies readonly BlockerType[];

export const GRANULARITIES = [2, 5, 10, 15] as const satisfies readonly Granularity[];

export const blockerSchema = z.enum(BLOCKER_TYPES);
export const granularitySchema = z.union([
  z.literal(2),
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);

/** 规范化后必须满足(DecomposeResult) */
export const decomposeResultSchema = z.object({
  blocker: blockerSchema,
  empathy: z.string().min(2),
  steps: z
    .array(z.object({ title: z.string().min(1), minutes: z.number().int().min(1).max(30) }))
    .min(3)
    .max(6),
  startCard: z.object({
    firstStep: z.string().min(1),
    minutes: z.number().int().min(1).max(2),
    doneCriteria: z.string().min(1),
    intent: z.string().min(4),
  }),
});

/** LLM 宽松版(Spark 输出,字段允许缺失,由 normalize 补齐) */
export const llmDecomposeSchema = z.object({
  blocker: blockerSchema,
  empathy: z.string().min(2),
  steps: z
    .array(z.object({ title: z.string().min(1).max(120), minutes: z.number().int().min(1).max(30) }))
    .min(1)
    .max(8),
  startCard: z.object({
    firstStep: z.string().min(1).max(120),
    minutes: z.number().int().min(1).max(15).optional(),
    doneCriteria: z.string().min(1).max(120),
    intent: z.string().min(4).max(120),
  }),
});

/** 规范化后必须满足(CoachPlan) */
export const taskItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  minutes: z.number().int().min(1),
  granularity: granularitySchema,
  done: z.boolean(),
});
export const dayPlanSchema = z.object({
  date: z.string().min(8),
  tasks: z.array(taskItemSchema),
});
export const weekPlanSchema = z.object({
  week: z.number().int().min(1),
  focus: z.string().min(1),
  days: z.array(dayPlanSchema).length(7),
});
export const coachPlanSchema = z.object({
  weeks: z.array(weekPlanSchema).min(1),
  notes: z.array(z.string()),
});

/** LLM 宽松版(Coach 输出:id 与 date 由系统规范化重生成) */
export const llmCoachPlanSchema = z.object({
  weeks: z
    .array(
      z.object({
        focus: z.string().min(1).max(60).optional(),
        days: z
          .array(
            z.object({
              tasks: z
                .array(
                  z.object({
                    title: z.string().min(1).max(80),
                    minutes: z.number().optional(),
                    granularity: z.number().optional(),
                  })
                )
                .max(3),
            })
          )
          .optional(),
      })
    )
    .min(1),
  notes: z.array(z.string().max(160)).optional(),
});

/** Mirror 摘要润色输出(其余字段由本地统计确定性生成) */
export const llmSummarySchema = z.object({
  summary: z.array(z.string().min(4).max(120)).length(3),
});

/** 任意数值收敛到最近的合法粒度档;cap 用于首周压顶(如 5) */
export function toGranularity(value: number | undefined, cap?: Granularity): Granularity {
  if (typeof value !== "number" || !Number.isFinite(value)) return cap ?? 2;
  let best: Granularity = 2;
  let dist = Infinity;
  for (const g of GRANULARITIES) {
    const d = Math.abs(g - value);
    if (d < dist) {
      dist = d;
      best = g;
    }
  }
  if (cap !== undefined && best > cap) best = cap;
  return best;
}

export function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}
