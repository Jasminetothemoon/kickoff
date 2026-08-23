// 技能包层:优先读 data/skillpacks/{id}.json;不存在或损坏时回退到内置 python-da 最小集(4 周)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CoachPlan, DayPlan, Granularity, TaskItem, WeekPlan } from "./types";
import { addDays, fmtDate } from "./datetime";

export interface SkillPackTaskTemplate {
  title: string;
  minutes: number;
  link?: string;      // 源自用户的资源(视频/教程)时携带
  linkTitle?: string;
}
export interface SkillPackWeekTemplate {
  week: number;
  focus: string;
  tasks: SkillPackTaskTemplate[];
}
export interface SkillPack {
  id: string;
  title: string;
  weeks: SkillPackWeekTemplate[];
}

// 外部 JSON 允许字段缺失;兼容两种字段命名:title|name, tasks|dailyTemplates
const taskSchema = z.object({
  title: z.string().min(1),
  minutes: z.number().int().min(1).max(240).optional(),
  granularity: z.number().int().optional(),
  link: z.string().url().optional(),
  linkTitle: z.string().optional(),
});
const skillPackFileSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  weeks: z
    .array(
      z.object({
        week: z.number().int().optional(),
        focus: z.string().min(1),
        tasks: z.array(taskSchema).optional(),
        dailyTemplates: z.array(taskSchema).optional(),
        topics: z.array(z.object({ id: z.string().optional(), name: z.string().optional() })).optional(),
      })
    )
    .min(1),
});

export function loadSkillPack(skillPackId: string): SkillPack {
  const file = path.join(process.cwd(), "data", "skillpacks", `${skillPackId}.json`);
  if (existsSync(file)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf-8"));
      const parsed = skillPackFileSchema.safeParse(raw);
      if (parsed.success) {
        return {
          id: parsed.data.id ?? skillPackId,
          title: parsed.data.title ?? parsed.data.name ?? skillPackId,
          weeks: parsed.data.weeks.map((w, i) => ({
            week: w.week ?? i + 1,
            focus: w.focus,
            tasks: (w.tasks ?? w.dailyTemplates ?? []).map((t) => ({
              title: t.title,
              minutes: t.minutes ?? 15,
              ...(t.link ? { link: t.link, linkTitle: t.linkTitle ?? t.link } : {}),
            })),
          })),
        };
      }
    } catch {
      // 文件损坏 → 内置兜底
    }
  }
  return builtinPythonDA();
}

/** 内置最小集:Python 数据分析 4 周模板(保证无外部文件时系统完全可用) */
function builtinPythonDA(): SkillPack {
  return {
    id: "python-da",
    title: "Python 数据分析入门(内置 4 周)",
    weeks: [
      {
        week: 1,
        focus: "Python 环境与基础语法",
        tasks: [
          { title: "安装/打开编辑器,跑通第一个 print", minutes: 10 },
          { title: "变量与数据类型:给 3 条信息各建一个变量", minutes: 15 },
          { title: "字符串基础:拼接并格式化一句自我介绍", minutes: 15 },
          { title: "列表:把本周任务写成一个 list 并遍历", minutes: 20 },
          { title: "条件分支:写一个 if/else 小判断", minutes: 15 },
          { title: "循环:用 for 打印 1 到 10", minutes: 15 },
        ],
      },
      {
        week: 2,
        focus: "数据结构与文件读写",
        tasks: [
          { title: "字典:建一个「概念→一句话解释」字典", minutes: 20 },
          { title: "集合与去重:练习 set 常用操作", minutes: 15 },
          { title: "文件读写:把学习笔记写入 txt 再读出", minutes: 20 },
          { title: "异常处理:用 try/except 包住一段输入代码", minutes: 15 },
          { title: "综合小练习:通讯录命令行小程序", minutes: 30 },
        ],
      },
      {
        week: 3,
        focus: "数据分析入门:NumPy 与 pandas",
        tasks: [
          { title: "安装 pandas/numpy,认识 Series 与 DataFrame", minutes: 20 },
          { title: "用 pandas 读取一个 CSV 并查看前 5 行", minutes: 20 },
          { title: "数据筛选:按条件选出行与列", minutes: 25 },
          { title: "分组聚合:groupby 统计均值与计数", minutes: 25 },
          { title: "简单可视化:画一条趋势线", minutes: 25 },
        ],
      },
      {
        week: 4,
        focus: "迷你实战:完整数据分析小项目",
        tasks: [
          { title: "选定一个小数据集,明确要回答的问题", minutes: 15 },
          { title: "数据清洗:处理缺失值与重复行", minutes: 30 },
          { title: "分析出数:回答问题并记录结论", minutes: 30 },
          { title: "结果可视化与一页小结", minutes: 30 },
          { title: "复盘:写下下一步想深入的方向", minutes: 10 },
        ],
      },
    ],
  };
}

export interface CoachPlanBuildOptions {
  planId: string; // 任务 id 前缀(即 goalId)
  weeks: number;
  minutesPerDay: number;
  startDate: Date;
}

function makeTask(
  planId: string,
  week: number,
  day1: number,
  index: number,
  title: string,
  minutes: number,
  granularity: Granularity,
  link?: string,
  linkTitle?: string
): TaskItem {
  return {
    id: `${planId}-w${week}-d${day1}-t${index + 1}`,
    title,
    minutes: Math.max(1, Math.round(minutes)),
    granularity,
    done: false,
    ...(link ? { link, linkTitle: linkTitle ?? link } : {}),
  };
}

/** 模板 → CoachPlan:首周「最低可持续」(每天 1 个任务、粒度 2/5);第 2 周起按分钟数装载 */
export function buildCoachPlanFromSkillPack(
  pack: SkillPack,
  opts: CoachPlanBuildOptions
): CoachPlan {
  const weeks: WeekPlan[] = [];
  const packLen = Math.max(pack.weeks.length, 1);
  for (let w = 1; w <= opts.weeks; w++) {
    const tmpl = pack.weeks[(w - 1) % packLen];
    const pool: SkillPackTaskTemplate[] =
      tmpl.tasks.length > 0 ? tmpl.tasks : [{ title: "阅读今日主题并做笔记", minutes: 15 }];
    const round = Math.floor((w - 1) / packLen);
    const focus = round === 0 ? tmpl.focus : `${tmpl.focus}(进阶 第${round + 1} 轮)`;
    const days: DayPlan[] = [];
    for (let d = 0; d < 7; d++) {
      const date = fmtDate(addDays(opts.startDate, (w - 1) * 7 + d));
      const tasks: TaskItem[] = [];
      if (w === 1) {
        if (d < 6) {
          const t = pool[d % pool.length];
          const gran: Granularity = d < 3 ? 2 : 5;
          tasks.push(makeTask(opts.planId, w, d + 1, 0, t.title, Math.min(t.minutes, 15), gran, t.link, t.linkTitle));
        } else {
          tasks.push(
            makeTask(opts.planId, w, d + 1, 0, "复盘 5 分钟:数一数本周「我开始了几天」", 5, 5)
          );
        }
      } else {
        const gran: Granularity = opts.minutesPerDay >= 30 ? 15 : 10;
        let used = 0;
        let n = 0;
        let i = d; // 错位轮转,把任务池摊匀到各天
        while (n < 3 && used < opts.minutesPerDay) {
          const t = pool[i % pool.length];
          const minutes = Math.min(t.minutes, 30);
          if (n > 0 && used + minutes > opts.minutesPerDay + 10) break;
          tasks.push(makeTask(opts.planId, w, d + 1, n, t.title, minutes, gran, t.link, t.linkTitle));
          used += minutes;
          n += 1;
          i += 7;
        }
      }
      days.push({ date, tasks });
    }
    weeks.push({ week: w, focus, days });
  }
  return {
    weeks,
    notes: [
      "首周按「最低可持续」原则压载:每天最多 2 个任务,启动粒度 2-5 分钟,先建立连续 7 天「每天都开始」的记录。",
      `第 2 周起按每天约 ${opts.minutesPerDay} 分钟装载;打卡数据积累后,系统会自动升降任务粒度(2/5/10/15 分钟)。`,
      `技能包:${pack.title}(共 ${packLen} 周模板,超出部分循环进阶)。`,
    ],
  };
}


/** 通用兜底技能包:围绕任意目标主题的微启动模板(目标与技能包都不匹配时使用) */
export function builtinGeneric(topic: string): SkillPack {
  const t = topic.slice(0, 12);
  return {
    id: "general",
    title: `${t}(通用微启动路线)`,
    weeks: [
      {
        week: 1,
        focus: "微启动周:先建立「每天都开始」",
        tasks: [
          { title: `打开工具,把「${t}」写在今天清单第一行`, minutes: 2 },
          { title: `完成「${t}」的一个 2 分钟动作`, minutes: 2 },
          { title: `找到「${t}」的一项优质免费资源并收藏`, minutes: 5 },
          { title: `跟着资源学习 5 分钟,不求读懂`, minutes: 5 },
          { title: `写下关于「${t}」的 3 个具体问题`, minutes: 5 },
          { title: "查资料回答其中 1 个问题", minutes: 10 },
        ],
      },
      {
        week: 2,
        focus: "建立节奏:每天 10 分钟",
        tasks: [
          { title: `学习「${t}」核心概念 1 个,用自己的话写一句`, minutes: 10 },
          { title: `围绕该概念做一个最小练习`, minutes: 10 },
          { title: `再学 1 个概念并画一张关系草图`, minutes: 10 },
          { title: `复习昨天的概念(不看笔记复述)`, minutes: 5 },
          { title: `完成一个 15 分钟的综合小练习`, minutes: 15 },
        ],
      },
      {
        week: 3,
        focus: "深入与输出:学进去,讲出来",
        tasks: [
          { title: `挑选「${t}」的一个子主题深入`, minutes: 15 },
          { title: `把子主题讲给想象中的新手(费曼法)`, minutes: 10 },
          { title: `补齐讲解时卡壳的知识点`, minutes: 15 },
          { title: `写一篇 300 字学习笔记并发布`, minutes: 15 },
        ],
      },
      {
        week: 4,
        focus: "小项目与复盘",
        tasks: [
          { title: `规划一个与「${t}」相关的最小项目`, minutes: 10 },
          { title: "完成项目的第一个可运行版本", minutes: 20 },
          { title: "迭代一次:修复或改进一个点", minutes: 15 },
          { title: "复盘:写下 3 条「下次开始更快」的经验", minutes: 10 },
        ],
      },
    ],
  };
}

/** 目标 → 技能包匹配:关键词计分;无命中时返回围绕目标主题的通用包 */
const PACK_KEYWORDS: Record<string, string[]> = {
  "python-da": ["python", "数据分析", "pandas", "numpy", "爬虫", "机器学习入门"],
  "english-cet4": ["英语", "四级", "六级", "cet", "词汇", "单词", "听力"],
  "general-web": ["web", "前端", "html", "css", "javascript", "js", "react", "vue", "网页", "全栈"],
  "job-hunting": ["求职", "简历", "面试", "投递", "外企", "大厂", "offer", "秋招", "春招", "跳槽", "找工作", "岗位"],
};

export interface PackMatch {
  pack: SkillPack;
  matched: boolean; // true=命中具体/自定义技能包;false=通用兜底
}

/** 目标→技能包:①用户自定义包(带资源生成的专属路线)优先 ②内置关键词 ③通用微启动兜底 */
export async function matchSkillPack(userId: string, goalTitle: string): Promise<PackMatch> {
  try {
    const { findCustomPack } = await import("./customPack");
    const custom = await findCustomPack(userId, goalTitle);
    if (custom) return { pack: custom, matched: true };
  } catch {
    // 自定义包查询失败不阻塞
  }
  const lower = goalTitle.toLowerCase();
  let bestId: string | null = null;
  let bestScore = 0;
  for (const [id, kws] of Object.entries(PACK_KEYWORDS)) {
    const score = kws.reduce((n, k) => (lower.includes(k.toLowerCase()) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  if (bestId === "general-web") {
    return { pack: builtinGeneric(goalTitle), matched: false };
  }
  if (bestId) {
    return { pack: loadSkillPack(bestId), matched: true };
  }
  return { pack: builtinGeneric(goalTitle), matched: false };
}
