// 双画像读写:JSON 解析全部容错(损坏数据回退默认),聚合量用指数平滑更新
import {
  defaultLearnerProfile,
  defaultProcrastinationProfile,
  prisma,
} from "./db";
import { BLOCKER_TYPES, GRANULARITIES } from "./schemas";
import type {
  BlockerType,
  Granularity,
  LearnerProfile,
  ProcrastinationProfile,
} from "./types";

export interface DualProfile {
  learner: LearnerProfile;
  procrastination: ProcrastinationProfile;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asString(v: unknown, fb: string): string {
  return typeof v === "string" ? v : fb;
}
function asNumber(v: unknown, fb: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fb;
}
function asIntArray(v: unknown, fb: number[], lo: number, hi: number): number[] {
  if (!Array.isArray(v)) return fb;
  const out = v.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return out.map((x) => Math.min(hi, Math.max(lo, Math.trunc(x))));
}

export function parseLearner(raw: string): LearnerProfile {
  const fb = defaultLearnerProfile();
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v)) return fb;
    const mastery: Record<string, number> = {};
    if (isRecord(v.mastery)) {
      for (const k of Object.keys(v.mastery)) {
        const n = v.mastery[k];
        if (typeof n === "number" && Number.isFinite(n)) {
          mastery[k] = Math.min(100, Math.max(0, n));
        }
      }
    }
    return {
      goal: asString(v.goal, fb.goal),
      motivation: asString(v.motivation, fb.motivation),
      mastery,
      historyCompletion: Math.min(1, Math.max(0, asNumber(v.historyCompletion, 0))),
    };
  } catch {
    return fb;
  }
}

export function parseProcrastination(raw: string): ProcrastinationProfile {
  const fb = defaultProcrastinationProfile();
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v)) return fb;
    // 分布缺失时保留均匀先验,已有键则覆盖
    const blockerDist: Partial<Record<BlockerType, number>> = { ...fb.blockerDist };
    if (isRecord(v.blockerDist)) {
      for (const k of BLOCKER_TYPES) {
        const n = v.blockerDist[k];
        if (typeof n === "number" && Number.isFinite(n)) {
          blockerDist[k] = Math.min(1, Math.max(0, n));
        }
      }
    }
    const successByGran: ProcrastinationProfile["successByGran"] = {};
    if (isRecord(v.successByGran)) {
      for (const key of Object.keys(v.successByGran)) {
        const e = v.successByGran[key];
        if (isRecord(e)) {
          const success = Math.max(0, Math.round(asNumber(e.success, 0)));
          const total = Math.round(asNumber(e.total, 0));
          if (total > 0) successByGran[key] = { success, total };
        }
      }
    }
    return {
      blockerDist,
      successByGran,
      avgStartDelayMin: Math.max(0, asNumber(v.avgStartDelayMin, fb.avgStartDelayMin)),
      activeHours: asIntArray(v.activeHours, fb.activeHours, 0, 23),
      lowDays: asIntArray(v.lowDays, fb.lowDays, 0, 6),
    };
  } catch {
    return fb;
  }
}

async function ensureProfileRow(userId: string) {
  return prisma.profile.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      learner: JSON.stringify(defaultLearnerProfile()),
      procrastination: JSON.stringify(defaultProcrastinationProfile()),
    },
  });
}

export async function getProfile(userId: string): Promise<DualProfile> {
  const row = await ensureProfileRow(userId);
  return {
    learner: parseLearner(row.learner),
    procrastination: parseProcrastination(row.procrastination),
  };
}

/** 新卡点诊断按 α=0.25 指数平滑混入分布(结构只存分布,不存计数) */
function blendBlockerDist(
  dist: Partial<Record<BlockerType, number>>,
  blocker: BlockerType
): Partial<Record<BlockerType, number>> {
  const ALPHA = 0.25;
  const next: Partial<Record<BlockerType, number>> = {};
  for (const k of BLOCKER_TYPES) {
    const prev = typeof dist[k] === "number" ? dist[k] : 0;
    next[k] = Math.round((prev * (1 - ALPHA) + (k === blocker ? ALPHA : 0)) * 1000) / 1000;
  }
  return next;
}

export interface CheckInProfileUpdate {
  granularity: Granularity;
  mood?: string;
  delaySeconds?: number;
  blocker?: BlockerType;
}

export interface UpdateOnCheckInResult {
  before: ProcrastinationProfile;
  after: ProcrastinationProfile;
  previousSuggestion: Granularity;
  suggestion: Granularity;
}

export async function updateOnCheckIn(
  userId: string,
  input: CheckInProfileUpdate
): Promise<UpdateOnCheckInResult> {
  const row = await ensureProfileRow(userId);
  const before = parseProcrastination(row.procrastination);
  const previousSuggestion = suggestGranularity(before);

  const delaySeconds = Math.min(Math.max(input.delaySeconds ?? 0, 0), 86400);
  const delayMin = delaySeconds / 60;
  // 「启动成功」定义:提醒后 10 分钟内开始(对应 TMT 的缩短延迟)
  const ok = delaySeconds <= 600;
  const key = String(input.granularity);
  const cur = before.successByGran[key] ?? { success: 0, total: 0 };
  const successByGran = {
    ...before.successByGran,
    [key]: { success: cur.success + (ok ? 1 : 0), total: cur.total + 1 },
  };
  // 平均启动延迟:EMA(β=0.3);首次记录直接采用本次值
  const avgStartDelayMin =
    before.avgStartDelayMin > 0
      ? Math.round((before.avgStartDelayMin * 0.7 + delayMin * 0.3) * 10) / 10
      : Math.round(delayMin * 10) / 10;
  const after: ProcrastinationProfile = {
    ...before,
    successByGran,
    blockerDist: input.blocker ? blendBlockerDist(before.blockerDist, input.blocker) : before.blockerDist,
    avgStartDelayMin,
  };
  await prisma.profile.update({
    where: { userId },
    data: { procrastination: JSON.stringify(after) },
  });
  return { before, after, previousSuggestion, suggestion: suggestGranularity(after) };
}

/**
 * 粒度建议:「当前档」取试用次数最多的档(无数据返回 2);
 * 成功率<0.5 降一档(2 为底);>0.8 且样本≥3 升一档(15 为顶)。
 * 注:successByGran 只存聚合量,「连续 3 次」以 total≥3 且成功率>0.8 近似。
 */
export function suggestGranularity(profile: ProcrastinationProfile): Granularity {
  let current: Granularity = 2;
  let maxTotal = 0;
  let stat: { success: number; total: number } | null = null;
  for (const g of GRANULARITIES) {
    const s = profile.successByGran[String(g)];
    if (s && s.total > maxTotal) {
      maxTotal = s.total;
      current = g;
      stat = s;
    }
  }
  if (!stat || stat.total === 0) return 2;
  const rate = stat.success / stat.total;
  const idx = GRANULARITIES.indexOf(current);
  if (rate < 0.5) return GRANULARITIES[Math.max(0, idx - 1)];
  if (rate > 0.8 && stat.total >= 3) {
    return GRANULARITIES[Math.min(GRANULARITIES.length - 1, idx + 1)];
  }
  return current;
}

export interface LowDaySample {
  startedAt: Date | string;
  completedAt?: Date | string | null;
}

/** 周几(0=周日)完成率 <0.4 且样本 ≥2 → 判为低谷日 */
export function detectLowDays(checkIns: LowDaySample[]): number[] {
  const buckets = new Map<number, { done: number; total: number }>();
  for (const c of checkIns) {
    const d = typeof c.startedAt === "string" ? new Date(c.startedAt) : c.startedAt;
    if (Number.isNaN(d.getTime())) continue;
    const wd = d.getDay();
    const b = buckets.get(wd) ?? { done: 0, total: 0 };
    b.total += 1;
    if (c.completedAt !== null && c.completedAt !== undefined && c.completedAt !== "") b.done += 1;
    buckets.set(wd, b);
  }
  const low: number[] = [];
  for (const [wd, b] of buckets) {
    if (b.total >= 2 && b.done / b.total < 0.4) low.push(wd);
  }
  return low.sort((a, b) => a - b);
}

/** Mirror 复盘产生的画像增量直接覆盖对应字段(未给出的字段不动) */
export async function applyProfileDelta(
  userId: string,
  delta: Partial<ProcrastinationProfile>
): Promise<ProcrastinationProfile> {
  const row = await ensureProfileRow(userId);
  const cur = parseProcrastination(row.procrastination);
  const next: ProcrastinationProfile = {
    ...cur,
    ...(delta.blockerDist ? { blockerDist: delta.blockerDist } : {}),
    ...(delta.successByGran ? { successByGran: delta.successByGran } : {}),
    ...(typeof delta.avgStartDelayMin === "number" ? { avgStartDelayMin: delta.avgStartDelayMin } : {}),
    ...(delta.activeHours ? { activeHours: delta.activeHours } : {}),
    ...(delta.lowDays ? { lowDays: delta.lowDays } : {}),
  };
  await prisma.profile.update({
    where: { userId },
    data: { procrastination: JSON.stringify(next) },
  });
  return next;
}
