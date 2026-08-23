// Kickoff 评测脚本
// 运行:在仓库根目录执行 `npm run eval`(需先 `npm run sim:gen` 生成 data/simulated/seed.json)
// 流程:读取 seed.json → 计算四指标(按画像与总体)→ 三个消融基线(重放)→ 生成 eval/report.md
// 本脚本不依赖服务器/API;重放为确定性计算(期望值法),输出可复现。

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PersonaId, SimDataset, SimDay } from "./metrics";
import {
  adaptiveUplift,
  avgStartDelay,
  completionRate,
  daysOfPersona,
  firstStartRate,
  sortDaysByDate,
  startDelayTrend,
  week1Completion,
} from "./metrics";

const ROOT = process.cwd();
const SEED_PATH = join(ROOT, "data", "simulated", "seed.json");
const REPORT_PATH = join(ROOT, "eval", "report.md");

// ---------- 格式化(数字保留 1 位小数) ----------

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`;
const dec = (v: number | null | undefined, suffix = ""): string =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(1)}${suffix}`;
const signed = (v: number | null | undefined, suffix = ""): string =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}${suffix}`;

// ---------- 数据加载 ----------

function loadDataset(): SimDataset {
  let raw: string;
  try {
    raw = readFileSync(SEED_PATH, "utf8");
  } catch {
    throw new Error(`未找到 ${SEED_PATH},请先在仓库根目录运行:npm run sim:gen`);
  }
  const data = JSON.parse(raw) as SimDataset;
  if (!data || !Array.isArray(data.days) || data.days.length === 0) {
    throw new Error("seed.json 结构异常(缺少非空 days 数组),请重新运行 npm run sim:gen");
  }
  for (const d of data.days) {
    if (!d || typeof d.date !== "string" || !Array.isArray(d.tasks)) {
      throw new Error("seed.json 的 days 记录结构异常,请重新运行 npm run sim:gen");
    }
  }
  return data;
}

// ---------- 消融基线(重放规则) ----------

interface AblationRow {
  name: string;
  note: string;
  startRate: number;
  completionRate: number;
}

function ablationRows(days: SimDay[]): AblationRow[] {
  const full = adaptiveUplift(days); // 完整版:自适应粒度重放
  const noFocus = adaptiveUplift(days, { minGranularity: 5 }); // 2 分钟档不可用
  return [
    {
      name: "完整版",
      note: "双画像 + 自适应粒度 + 主动督促 + 专注支持",
      startRate: full.adaptiveStartRate,
      completionRate: full.adaptiveCompletionRate,
    },
    {
      name: "消融A·仅提醒无画像",
      note: "固定 15 分钟档,不按画像调粒度",
      startRate: full.fixedStartRate,
      completionRate: full.fixedCompletionRate,
    },
    {
      name: "消融B·仅拆解无督促",
      note: "保留自适应粒度,无督促,启动率×0.6;完成⊆启动且条件完成率不变,完成率同比例×0.6",
      startRate: full.adaptiveStartRate * 0.6,
      completionRate: full.adaptiveCompletionRate * 0.6,
    },
    {
      name: "消融C·无专注支持",
      note: "2 分钟档不可用(自适应下限抬高到 5 分钟)",
      startRate: noFocus.adaptiveStartRate,
      completionRate: noFocus.adaptiveCompletionRate,
    },
  ];
}

// ---------- 画像级汇总 ----------

interface PersonaEval {
  id: PersonaId;
  label: string;
  description: string;
  days: SimDay[];
  taskCount: number;
  firstStart: number;
  week1: number;
  completion: number;
  avgDelay: number | null;
  trend: ReturnType<typeof startDelayTrend>;
  uplift: ReturnType<typeof adaptiveUplift>;
  abl: AblationRow[];
  topBlocker: string;
}

function topBlocker(days: SimDay[]): string {
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.blocker, (counts.get(d.blocker) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.length ? `${sorted[0][0]}(${sorted[0][1]} 天)` : "—";
}

function evaluatePersona(id: PersonaId, allDays: SimDay[]): PersonaEval {
  const days = daysOfPersona(allDays, id);
  return {
    id,
    label: id,
    description: "—",
    days,
    taskCount: days.reduce((s, d) => s + d.tasks.length, 0),
    firstStart: firstStartRate(days),
    week1: week1Completion(days),
    completion: completionRate(days),
    avgDelay: avgStartDelay(days),
    trend: startDelayTrend(days),
    uplift: adaptiveUplift(days),
    abl: ablationRows(days),
    topBlocker: topBlocker(days),
  };
}

// ---------- 主流程 ----------

function main(): void {
  const dataset = loadDataset();
  const allDays = sortDaysByDate(dataset.days);

  // 画像元信息(seed.json 内嵌;缺失时退回用画像 id)
  const metaById = new Map<PersonaId, { label: string; description: string }>();
  for (const p of dataset.personas ?? []) metaById.set(p.id, { label: p.label, description: p.description });
  const personaIds: PersonaId[] = metaById.size
    ? [...metaById.keys()]
    : [...new Set(allDays.map(d => d.persona))];

  const personaEvals = personaIds.map(id => {
    const ev = evaluatePersona(id, allDays);
    const meta = metaById.get(id);
    if (meta) {
      ev.label = meta.label;
      ev.description = meta.description;
    }
    return ev;
  });

  const overall = {
    label: "总体",
    taskCount: allDays.reduce((s, d) => s + d.tasks.length, 0),
    dayCount: allDays.length,
    firstStart: firstStartRate(allDays),
    week1: week1Completion(allDays),
    completion: completionRate(allDays),
    avgDelay: avgStartDelay(allDays),
    trend: startDelayTrend(allDays),
    uplift: adaptiveUplift(allDays),
    abl: ablationRows(allDays),
  };

  const totalTasks = overall.taskCount;

  // ---------- 报告 ----------

  const lines: string[] = [];
  lines.push("# Kickoff 模拟数据评测报告");
  lines.push("");
  lines.push(
    `> 数据:脚本生成的模拟学习者行为(seed=${dataset.seed},3 个画像 × ${dataset.dayCount} 天,` +
      `起始 ${dataset.startDate},共 ${totalTasks} 个任务)。**模拟数据,非真实用户**;` +
      `所有数值仅用于验证指标口径与消融框架,不构成真实效果声明(诚实评测,见计划书 §12.4)。`
  );
  lines.push("");

  // 1. 数据集概览
  lines.push("## 1. 数据集概览");
  lines.push("");
  lines.push("| 画像 | 设定说明 | 日记录数 | 任务数 | 主要卡点(天数) |");
  lines.push("|---|---|---|---|---|");
  for (const p of personaEvals) {
    lines.push(`| ${p.label}(${p.id}) | ${p.description} | ${p.days.length} | ${p.taskCount} | ${p.topBlocker} |`);
  }
  lines.push(`| 总体 | — | ${allDays.length} | ${totalTasks} | — |`);
  lines.push("");

  // 2. 主指标
  lines.push("## 2. 主指标(按画像与总体)");
  lines.push("");
  lines.push(
    "指标定义见 `eval/README.md`。首次启动率=收到任务 5 分钟内开始的比例;启动延迟周环比为负值=改善;" +
      "自适应提升=按「成功率<0.5 降档、>0.8 升档」规则重放,对比固定 15 分钟基线的期望完成率差(百分点)。"
  );
  lines.push("");
  lines.push(
    "| 画像 | 首次启动率(≤5分钟) | 首周完成率 | 全期完成率 | 平均启动延迟(分钟) | 延迟周环比(总变化) | 自适应提升(pp) |"
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of personaEvals) {
    lines.push(
      `| ${p.label} | ${pct(p.firstStart)} | ${pct(p.week1)} | ${pct(p.completion)} | ` +
        `${dec(p.avgDelay)} | ${signed(p.trend.overallChangePct, "%")} | ${signed(p.uplift.completionUpliftPP)} |`
    );
  }
  lines.push(
    `| 总体 | ${pct(overall.firstStart)} | ${pct(overall.week1)} | ${pct(overall.completion)} | ` +
      `${dec(overall.avgDelay)} | ${signed(overall.trend.overallChangePct, "%")} | ${signed(overall.uplift.completionUpliftPP)} |`
  );
  lines.push("");

  // 3. 启动延迟按周
  const maxWeeks = Math.max(1, overall.trend.weeks.length);
  lines.push("## 3. 启动延迟按周(分钟,已启动任务)");
  lines.push("");
  const weekHeads = Array.from({ length: maxWeeks }, (_, i) => `第${i + 1}周`).join(" | ");
  lines.push(`| 画像 | ${weekHeads} | 总变化 |`);
  lines.push(`|---|${Array.from({ length: maxWeeks }, () => "---").join("|")}|---|`);
  for (const p of personaEvals) {
    const cells = Array.from({ length: maxWeeks }, (_, i) => dec(p.trend.weeks[i]?.avgDelayMinutes ?? null)).join(" | ");
    lines.push(`| ${p.label} | ${cells} | ${signed(p.trend.overallChangePct, "%")} |`);
  }
  {
    const cells = Array.from({ length: maxWeeks }, (_, i) => dec(overall.trend.weeks[i]?.avgDelayMinutes ?? null)).join(" | ");
    lines.push(`| 总体 | ${cells} | ${signed(overall.trend.overallChangePct, "%")} |`);
  }
  const allDates = [...new Set(allDays.map(d => d.date))].sort();
  const lastWeekNatDays = Math.max(1, allDates.length - (maxWeeks - 1) * 7);
  lines.push("");
  lines.push(
    `注:每周按 7 个自然日划分;${allDates.length} 天数据共 ${maxWeeks} 周,第 ${maxWeeks} 周仅含 ${lastWeekNatDays} 个自然日。负值=延迟下降(改善)。`
  );
  lines.push("");

  // 4. 消融基线
  lines.push("## 4. 消融基线(确定性重放)");
  lines.push("");
  lines.push(
    "重放均以各画像在四个粒度档位上的经验启动率/完成率为期望值(无二次随机):" +
      "完整版=自适应粒度规则(15 分钟起步,窗口 4 个任务期望完成率<0.5 降档、>0.8 升档);" +
      "消融A=仅提醒无画像(固定 15 分钟);消融B=仅拆解无督促(启动率×0.6,完成率同比例×0.6);" +
      "消融C=无专注支持(2 分钟档不可用,下限 5 分钟)。"
  );
  lines.push("");
  const personaCols = personaEvals.map(p => `完成率(${p.label})`).join(" | ");
  lines.push(`| 配置 | ${personaCols} | 总体启动率 | 总体完成率 | 总体Δ完成率(pp) |`);
  lines.push(`|---|${personaEvals.map(() => "---").join("|")}|---|---|---|`);
  for (let r = 0; r < overall.abl.length; r++) {
    const cells = personaEvals.map(p => pct(p.abl[r].completionRate)).join(" | ");
    const delta = (overall.abl[r].completionRate - overall.abl[0].completionRate) * 100;
    lines.push(
      `| ${overall.abl[r].name} | ${cells} | ${pct(overall.abl[r].startRate)} | ` +
        `${pct(overall.abl[r].completionRate)} | ${signed(delta)} |`
    );
  }
  lines.push("");

  // 5. 结论
  const dropA = (overall.abl[0].completionRate - overall.abl[1].completionRate) * 100;
  const dropB = (overall.abl[0].completionRate - overall.abl[2].completionRate) * 100;
  const dropC = (overall.abl[0].completionRate - overall.abl[3].completionRate) * 100;
  const adhd = personaEvals.find(p => p.id === "adhd-lean");
  const adhdDropC = adhd ? (adhd.abl[0].completionRate - adhd.abl[3].completionRate) * 100 : null;
  const adhd2Share = adhd ? adhd.uplift.adaptiveGranShares[2] : null;

  lines.push("## 5. 结论");
  lines.push("");
  lines.push(
    `在 ${dataset.dayCount} 天模拟数据(3 个画像、共 ${totalTasks} 个任务)上,总体首次启动率(≤5 分钟)为 ` +
      `${pct(overall.firstStart)},首周完成率 ${pct(overall.week1)},平均启动延迟 ${dec(overall.avgDelay)} 分钟、` +
      `周环比总变化 ${signed(overall.trend.overallChangePct, "%")}(负值为改善)。按「成功率<0.5 降档、>0.8 升档」重放时,` +
      `自适应粒度将总体完成率从固定 15 分钟基线的 ${pct(overall.uplift.fixedCompletionRate)} 提升到 ` +
      `${pct(overall.uplift.adaptiveCompletionRate)}(${signed(overall.uplift.completionUpliftPP)} pp,` +
      `相对 ${signed(overall.uplift.completionUpliftRelPct, "%")})。消融显示:仅提醒无画像(固定 15 分钟)使总体完成率回落 ` +
      `${dec(dropA)} pp;仅拆解无督促(启动率×0.6)回落 ${dec(dropB)} pp;无专注支持(2 分钟档不可用)对总体影响 ` +
      `${dec(dropC)} pp${adhdDropC !== null ? `,但对 ADHD 倾向画像影响最大(回落 ${dec(adhdDropC)} pp${adhd2Share !== null ? `,该画像自适应重放中 ${(adhd2Share * 100).toFixed(1)}% 的任务落在 2 分钟档` : ""})` : ""},` +
      `与该画像「2 分钟档成功率 0.9、15 分钟档 0.3」的设定一致。以上均为模拟数据上的确定性重放结果(非真实用户实验),` +
      `数值由画像参数设定驱动,仅用于验证评测指标与消融框架,不构成效果声明。`
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `复现方式:仓库根目录依次运行 \`npm run sim:gen\`(生成 seed.json,seed=${dataset.seed})与 \`npm run eval\`(生成本报告);` +
      "两次运行不做任何修改则报告内容一致(无时间戳、无随机、无网络依赖)。"
  );
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");

  // ---------- stdout 摘要 ----------
  console.log("=== Kickoff 评测完成(模拟数据)===");
  console.log(`数据:${allDays.length} 条日记录 / ${totalTasks} 个任务(seed=${dataset.seed})`);
  for (const p of personaEvals) {
    console.log(
      `[${p.id}] ${p.label}:首次启动率 ${pct(p.firstStart)} | 首周完成率 ${pct(p.week1)} | ` +
        `全期完成率 ${pct(p.completion)} | 延迟总变化 ${signed(p.trend.overallChangePct, "%")} | ` +
        `自适应提升 ${signed(p.uplift.completionUpliftPP)} pp`
    );
  }
  console.log(
    `[overall] 首次启动率 ${pct(overall.firstStart)} | 首周完成率 ${pct(overall.week1)} | ` +
      `全期完成率 ${pct(overall.completion)} | 自适应提升 ${signed(overall.uplift.completionUpliftPP)} pp`
  );
  console.log(
    `消融(总体完成率):完整版 ${pct(overall.abl[0].completionRate)} | ` +
      `仅提醒无画像 ${pct(overall.abl[1].completionRate)} | ` +
      `仅拆解无督促 ${pct(overall.abl[2].completionRate)} | ` +
      `无专注支持 ${pct(overall.abl[3].completionRate)}`
  );
  console.log(`报告已写入 ${REPORT_PATH}`);
}

main();
