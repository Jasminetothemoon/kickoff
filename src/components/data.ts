// 前端共享:演示数据(API 不可用时兜底,保证页面独立可看)+ 本地工具函数
import { canQueue, enqueue } from "@/lib/offline";
import type {
  DecomposeResult,
  FocusSupportSettings,
  Granularity,
  LearnerProfile,
  ProcrastinationProfile,
  StartCard,
  TaskItem,
  WeekPlan,
} from "@/lib/types";

// ===== 今日(演示) =====
export const DEMO_FOCUS = "Python 数据分析 · 第 2 周";

export const DEMO_TASK: TaskItem = {
  id: "demo-task-1",
  title: "Python 数据分析 · intro.py 起步练习",
  minutes: 2,
  granularity: 2,
  done: false,
};

/** 「换更小的步骤」本地阶梯:从原型第一步逐步缩小,直到物理动作 */
export const SMALLER_STEPS: StartCard[] = [
  {
    firstStep: "打开编辑器,新建 intro.py,输入 print(\"hello\") 并运行",
    minutes: 2,
    doneCriteria: "终端输出 hello",
    intent: "今晚 21:30 坐到书桌前,我就打开编辑器新建文件",
  },
  {
    firstStep: "只打开编辑器,新建一个空的 intro.py(不用写任何代码)",
    minutes: 1,
    doneCriteria: "编辑器里出现这个空文件",
    intent: "今晚坐到书桌前,我就只打开编辑器建一个空文件",
  },
  {
    firstStep: "把手机反过来扣在桌上,把手放到键盘上,停 10 秒",
    minutes: 1,
    doneCriteria: "手在键盘上,屏幕亮着",
    intent: "坐下来的那一刻,我就把手放到键盘上",
  },
];

export const DEMO_START_CARD: StartCard = SMALLER_STEPS[0];

export const DEMO_WEEK_PROGRESS = { done: 6, total: 9 };

// ===== 计划(演示):以真实日历的本周周一开始 =====
export const WEEKDAY_CN = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function fmtMD(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function mondayOf(base: Date): Date {
  const d = new Date(base);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function task(i: number, j: number, title: string, minutes: number, granularity: Granularity, done: boolean): TaskItem {
  return { id: `w2-d${i}-t${j}`, title, minutes, granularity, done };
}

export function buildDemoWeek(): WeekPlan {
  const mon = mondayOf(new Date());
  const dayTasks: TaskItem[][] = [
    // 周一
    [task(0, 1, "复习:列表与字典常用操作", 10, 10, true), task(0, 2, "阅读 pandas 入门 10 分钟", 10, 10, true)],
    // 周二(低谷日 · 已减载;第 2 项 = 今日启动卡对应的任务)
    [task(1, 1, "语法小练:写 3 行列表推导", 5, 5, true), task(1, 2, "新建 intro.py,输入 print(\"hello\") 并运行", 2, 2, false)],
    // 周三(试探 10 分钟任务)
    [task(2, 1, "pandas:读取 CSV 的前 10 行", 10, 10, true), task(2, 2, "照着示例画第一张柱状图", 10, 10, true)],
    // 周四(低谷日 · 已减载)
    [task(3, 1, "复盘本周错题,写 3 行总结", 5, 5, false)],
    // 周五
    [task(4, 1, "把本周代码整理提交到 GitHub", 10, 10, true)],
    // 周六
    [task(5, 1, "弹性:补本周未完成项(可选)", 10, 10, false)],
    // 周日:弹性缓冲日
    [],
  ];
  return {
    week: 2,
    focus: DEMO_FOCUS,
    days: dayTasks.map((tasks, i) => ({ date: fmtDate(addDays(mon, i)), tasks })),
  };
}

// ===== 画像(演示) =====
export const DEMO_PROFILE: { learner: LearnerProfile; procrastination: ProcrastinationProfile } = {
  learner: {
    goal: "掌握 Python 数据分析,做出第一个可视化小项目",
    motivation: "3 个月内完成转行作品集,拖延是目前最大的敌人",
    mastery: { "Python 基础": 62, "pandas": 35, "数据可视化": 18 },
    historyCompletion: 0.58,
  },
  procrastination: {
    blockerDist: { "模糊型": 0.42, "完美主义型": 0.31, "畏难型": 0.17, "动力型": 0.1 },
    successByGran: {
      "2": { success: 22, total: 25 },
      "5": { success: 19, total: 25 },
      "10": { success: 9, total: 15 },
      "15": { success: 7, total: 17 },
    },
    avgStartDelayMin: 9,
    activeHours: [20, 21, 22],
    lowDays: [2, 4], // 0=周日 → 周二/周四
  },
};

export const DEMO_REVIEW: string[] = [
  "启动延迟中位数 9 分钟,比上周快 6 分钟",
  "周二/周四成功率偏低 → Coach 已自动减半任务",
  "「烂开始」策略对你效果显著:完美主义卡点占比下降 8%",
];

// ===== 拆解(演示):按细度级别生成 =====
export const GRAN_LABELS = ["极细", "细", "中", "粗"] as const;
export const GRAN_MINUTES: number[] = [2, 5, 10, 15];

export function demoDecompose(rawTask: string, level: number): DecomposeResult {
  const t = rawTask.trim() || "这个一直没动笔的任务";
  const short = t.length > 12 ? `${t.slice(0, 12)}…` : t;
  const plans: { title: string; minutes: number }[][] = [
    // 极细(ADHD 友好)
    [
      { title: `打开材料,新建文件,写一行注释:# ${short}`, minutes: 1 },
      { title: "只写下这件事的第一行(不管对错)", minutes: 2 },
      { title: "回想:这件事的最小规则是什么", minutes: 2 },
      { title: "写第一版「烂实现」,能跑就行", minutes: 3 },
      { title: "检查一遍,交给 Mirror 复盘", minutes: 2 },
    ],
    // 细
    [
      { title: `打开材料,写一行注释:# ${short}(2 分钟)`, minutes: 2 },
      { title: "只写开头/函数名,不管对错", minutes: 3 },
      { title: "回想或搜索:关键规则是什么", minutes: 5 },
      { title: "写第一版「烂实现」", minutes: 8 },
      { title: "测试 + 复盘盘问", minutes: 5 },
    ],
    // 中
    [
      { title: `把「${short}」切成 3 段,写下段名`, minutes: 5 },
      { title: "完成第一段(允许粗糙)", minutes: 10 },
      { title: "完成剩余两段 + 检查", minutes: 15 },
    ],
    // 粗
    [
      { title: `第一版整体草稿:${short}`, minutes: 15 },
      { title: "修订 + 检查提交", minutes: 15 },
    ],
  ];
  const steps = plans[level - 1] ?? plans[1];
  const first = steps[0] ?? { title: "打开材料,先写下一行注释", minutes: 2 };
  return {
    blocker: level <= 2 ? "模糊型" : "完美主义型",
    empathy: `收到。「${short}」对大脑来说还是太模糊了,模糊 = 拖延开关。我把它拆好了,第一步只要 ${first.minutes} 分钟:`,
    steps,
    startCard: {
      firstStep: first.title,
      minutes: first.minutes,
      doneCriteria: "做完第一步即算成功,不求完美",
      intent: "现在坐到桌前,我就只做这第一步",
    },
  };
}

// ===== 设置(localStorage) =====
export const SETTINGS_KEY = "kickoff.focusSettings";
export const DEFAULT_SETTINGS: FocusSupportSettings = { enabled: true, sprintMinutes: 10, singleTaskView: false };

export function loadSettings(): FocusSupportSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<FocusSupportSettings>) };
  } catch {
    // 忽略损坏的本地数据
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: FocusSupportSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 隐私模式等场景写入失败时静默降级
  }
}

// ===== fetch 工具 =====
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    // 断网容忍:打卡/杂念停车场先进离线队列,联网自动重放(体验不中断)
    if (typeof window !== "undefined" && canQueue(url) && !(err instanceof Error && err.message.startsWith("HTTP"))) {
      enqueue(url, body);
      if (url === "/api/checkins") {
        return { ok: true, celebration: "📴 已离线记录 — 联网后自动同步,这一步算数!", adjustments: [] } as T;
      }
      return { ok: true, count: 0 } as T;
    }
    throw err;
  }
}
