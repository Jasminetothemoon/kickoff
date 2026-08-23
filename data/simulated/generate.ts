// Kickoff 模拟学习者数据生成器(评测用)
// 运行:在仓库根目录执行 `npm run sim:gen`
// 输出:data/simulated/seed.json(3 个画像 × 30 天 = 90 条日记录)
//
// 可复现性:mulberry32 seeded PRNG,seed 固定 42;不含时间戳、不访问网络/API,
// 同一版本脚本多次运行的输出逐字节一致。
//
// 画像设定(与计划书 §12 评测口径对齐):
//   a) perfectionist-heavy 完美主义重度:卡点以完美主义型为主,15 分钟任务成功率 0.35,启动延迟高;
//   b) vague-light 模糊型轻度:卡点以模糊型为主,小粒度成功率高;
//   c) adhd-lean ADHD 倾向:2 分钟档成功率 0.9、5 分钟档 0.8、15 分钟档 0.3,活跃时段偏晚。

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlockerType, Granularity } from "../../src/lib/types";
import type { PersonaId, SimDataset, SimDay, SimTask } from "../../eval/metrics";
import { avgStartDelay, completionRate, firstStartRate } from "../../eval/metrics";

// ---------- 常量 ----------

const SEED = 42;
const DAY_COUNT = 30;
const START_DATE = "2026-07-01"; // 固定起点,保证跨次运行一致
const GRAN_MIX: [Granularity, number][] = [
  [2, 0.25],
  [5, 0.25],
  [10, 0.25],
  [15, 0.25],
]; // 模拟系统在四个档位上均匀探索,保证每个档位都有观测样本

// ---------- PRNG:mulberry32 ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 随机辅助 ----------

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, weight] of items) {
    r -= weight;
    if (r < 0) return value;
  }
  return items[items.length - 1][0];
}

function clampInt(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(x)));
}

function dateByIndex(i: number): string {
  return new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10); // 2026-07-01 起
}

// ---------- 画像设定 ----------
// successByGran:该粒度任务的(无条件)完成概率;startByGran:启动概率;
// quickStartByGran:启动时"收到即开始(0~4 分钟)"的概率,否则延迟走指数尾部;
// 条件完成率 = successByGran / startByGran(完成必先开始)。

interface PersonaSpec {
  id: PersonaId;
  label: string;
  description: string;
  blockerDist: [BlockerType, number][];
  successByGran: Record<Granularity, number>;
  startByGran: Record<Granularity, number>;
  quickStartByGran: Record<Granularity, number>;
  delayTailMean: number;       // 拖延尾部(指数分布)均值,分钟
  weeklyDelayImprovement: number; // 每周尾部均值衰减比例(督促下延迟逐步改善)
  tasksPerDay: [number, number];
  moodBase: number;            // 1~5
  activeHours: number[];       // 0~23
}

const PERSONAS: PersonaSpec[] = [
  {
    id: "perfectionist-heavy",
    label: "完美主义重度",
    description: "卡点以完美主义型为主,15 分钟任务成功率 0.35,启动延迟高",
    blockerDist: [
      ["完美主义型", 0.55],
      ["畏难型", 0.2],
      ["疲劳型", 0.15],
      ["动力型", 0.1],
    ],
    successByGran: { 2: 0.5, 5: 0.45, 10: 0.4, 15: 0.35 },
    startByGran: { 2: 0.72, 5: 0.62, 10: 0.52, 15: 0.45 },
    quickStartByGran: { 2: 0.22, 5: 0.16, 10: 0.11, 15: 0.08 },
    delayTailMean: 32,
    weeklyDelayImprovement: 0.05,
    tasksPerDay: [1, 2],
    moodBase: 3,
    activeHours: [9, 10, 11, 14, 15, 16, 20, 21],
  },
  {
    id: "vague-light",
    label: "模糊型轻度",
    description: "卡点以模糊型为主,小粒度(2/5 分钟)成功率高,整体拖延较轻",
    blockerDist: [
      ["模糊型", 0.6],
      ["畏难型", 0.15],
      ["动力型", 0.15],
      ["疲劳型", 0.1],
    ],
    successByGran: { 2: 0.85, 5: 0.8, 10: 0.6, 15: 0.42 },
    startByGran: { 2: 0.92, 5: 0.88, 10: 0.78, 15: 0.68 },
    quickStartByGran: { 2: 0.58, 5: 0.5, 10: 0.42, 15: 0.34 },
    delayTailMean: 12,
    weeklyDelayImprovement: 0.06,
    tasksPerDay: [2, 3],
    moodBase: 4,
    activeHours: [9, 10, 11, 15, 16, 17, 20, 21],
  },
  {
    id: "adhd-lean",
    label: "ADHD 倾向",
    description: "2 分钟档成功率 0.9、5 分钟档 0.8、15 分钟档 0.3,活跃时段偏晚",
    blockerDist: [
      ["动力型", 0.35],
      ["环境型", 0.25],
      ["疲劳型", 0.25],
      ["模糊型", 0.15],
    ],
    successByGran: { 2: 0.9, 5: 0.8, 10: 0.45, 15: 0.3 },
    startByGran: { 2: 0.95, 5: 0.85, 10: 0.6, 15: 0.5 },
    quickStartByGran: { 2: 0.62, 5: 0.48, 10: 0.3, 15: 0.22 },
    delayTailMean: 22,
    weeklyDelayImprovement: 0.04,
    tasksPerDay: [1, 3],
    moodBase: 3,
    activeHours: [15, 16, 17, 18, 19, 20, 21, 22, 23],
  },
];

// ---------- 生成 ----------

function generateDay(rng: () => number, spec: PersonaSpec, date: string, week: number): SimDay {
  const blocker = pickWeighted(rng, spec.blockerDist);
  const nTasks = randInt(rng, spec.tasksPerDay[0], spec.tasksPerDay[1]);
  const tasks: SimTask[] = [];
  for (let t = 0; t < nTasks; t++) {
    const gran = pickWeighted(rng, GRAN_MIX);
    const pStart = spec.startByGran[gran];
    const started = rng() < pStart;
    // 条件完成率 = 无条件成功率 / 启动率(完成必先开始),钳制到 [0,1]
    const pComplete = Math.min(1, spec.successByGran[gran] / Math.max(pStart, 1e-9));
    const completed = started && rng() < pComplete;

    let delayMinutes: number | null = null;
    if (started) {
      if (rng() < spec.quickStartByGran[gran]) {
        delayMinutes = randInt(rng, 0, 4); // 收到即开始
      } else {
        // 指数尾部:粒度越大延迟越长;督促下尾部均值逐周小幅下降
        const tailMean =
          spec.delayTailMean *
          (0.75 + 0.25 * (gran / 15)) *
          Math.max(0.5, 1 - spec.weeklyDelayImprovement * week);
        delayMinutes = Math.min(180, Math.round(-Math.log(1 - rng()) * Math.max(tailMean, 1)));
      }
    }

    const jitter = pickWeighted<number>(rng, [
      [-1, 0.15],
      [0, 0.7],
      [1, 0.15],
    ]);
    const mood = clampInt(
      spec.moodBase + (completed ? 1 : started ? 0 : -1) + jitter,
      1,
      5
    );
    tasks.push({ granularity: gran, started, delayMinutes, completed, mood });
  }
  return { date, persona: spec.id, tasks, blocker };
}

function main(): void {
  const rng = mulberry32(SEED);
  const days: SimDay[] = [];
  for (let i = 0; i < DAY_COUNT; i++) {
    const date = dateByIndex(i);
    const week = Math.floor(i / 7);
    for (const spec of PERSONAS) {
      days.push(generateDay(rng, spec, date, week));
    }
  }

  const dataset: SimDataset = {
    seed: SEED,
    startDate: START_DATE,
    dayCount: DAY_COUNT,
    personas: PERSONAS.map(p => ({
      id: p.id,
      label: p.label,
      description: p.description,
      activeHours: p.activeHours,
    })),
    days,
  };

  const outDir = join(process.cwd(), "data", "simulated");
  const outPath = join(outDir, "seed.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(dataset, null, 2) + "\n", "utf8");

  // ---------- stdout 汇总 ----------
  const totalTasks = days.reduce((s, d) => s + d.tasks.length, 0);
  console.log(`=== 模拟学习者数据生成完成(seed=${SEED})===`);
  console.log(`${PERSONAS.length} 个画像 × ${DAY_COUNT} 天 = ${days.length} 条日记录,共 ${totalTasks} 个任务`);
  console.log(`已写入 ${outPath}`);
  for (const spec of PERSONAS) {
    const personaDays = days.filter(d => d.persona === spec.id);
    const blockerCounts = new Map<string, number>();
    for (const d of personaDays) blockerCounts.set(d.blocker, (blockerCounts.get(d.blocker) ?? 0) + 1);
    const top = [...blockerCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topLabel = top ? `${top[0]}(${top[1]} 天)` : "—";
    const rate = (x: number) => `${(x * 100).toFixed(1)}%`;
    const delay = avgStartDelay(personaDays);
    console.log(
      `[${spec.id}] ${spec.label}:完成率 ${rate(completionRate(personaDays))} | ` +
        `首次启动率(≤5 分钟) ${rate(firstStartRate(personaDays))} | ` +
        `平均启动延迟 ${delay === null ? "—" : delay.toFixed(1)} 分钟 | ` +
        `主要卡点 ${topLabel}`
    );
  }
}

main();
