// ===== Kickoff 共享契约(所有模块以此为准,修改需经集成者同意)=====

export type Granularity = 2 | 5 | 10 | 15;

export type BlockerType =
  | "模糊型"
  | "畏难型"
  | "完美主义型"
  | "动力型"
  | "环境型"
  | "疲劳型";

/** 今日启动卡(Spark 的核心输出) */
export interface StartCard {
  firstStep: string;        // 第一步动作(≤2 分钟)
  minutes: number;          // 预计分钟数
  doneCriteria: string;     // 完成标准
  intent: string;           // 执行意图句:"如果到了X时间在X地点,我就..."
}

/** Spark 拆解结果 */
export interface DecomposeResult {
  blocker: BlockerType;
  empathy: string;          // 接纳型回应(情绪检查后)
  steps: { title: string; minutes: number }[];
  startCard: StartCard;
}

export interface TaskItem {
  id: string;
  title: string;
  minutes: number;
  granularity: Granularity;
  done: boolean;
  link?: string;       // 任务源自的资源(视频/教程),可选
  linkTitle?: string;
}

export interface DayPlan {
  date: string; // YYYY-MM-DD
  tasks: TaskItem[];
}

export interface WeekPlan {
  week: number;
  focus: string;
  days: DayPlan[]; // 长度 7
}

/** Coach 生成的计划 */
export interface CoachPlan {
  weeks: WeekPlan[];
  notes: string[]; // 给用户的说明(如首周压载原则)
}

/** 双画像 */
export interface LearnerProfile {
  goal: string;
  motivation: string;
  mastery: Record<string, number>; // 知识点 -> 0~100
  historyCompletion: number;       // 0~1
}

export interface ProcrastinationProfile {
  blockerDist: Partial<Record<BlockerType, number>>;  // 0~1 分布
  successByGran: Record<string, { success: number; total: number }>; // "2"|"5"|"10"|"15"
  avgStartDelayMin: number;
  activeHours: number[];   // 0~23
  lowDays: number[];       // 0=周日
}

export interface ReviewResult {
  summary: string[];                                  // 复盘要点
  errorTypes: { kind: "知识" | "习惯" | "情绪"; note: string }[];
  profileDelta: Partial<ProcrastinationProfile>;
  planAdjustments: { kind: "reduce" | "granularity" | "reschedule"; note: string }[];
}

export interface CheckInResult {
  ok: boolean;
  celebration: string;    // 即时奖励文案
  adjustments: string[];  // 本次画像更新带来的调整说明
}

/** 专注支持模式(设置页) */
export interface FocusSupportSettings {
  enabled: boolean;
  sprintMinutes: number;   // 默认 10
  singleTaskView: boolean;
}

// ===== API 契约 =====
// POST /api/goals    { title, weeks?, minutesPerDay?, motivation? } -> { goalId, plan: CoachPlan }
// GET  /api/today    -> { task: TaskItem|null, startCard: StartCard|null, weekProgress: {done,total}, today: string }
// POST /api/decompose { taskId?, rawTask, mood? } -> DecomposeResult
// POST /api/checkins  { taskId, mood?, delaySeconds?, granularity? } -> CheckInResult
// POST /api/review    { scope: "day"|"week" } -> ReviewResult
// GET  /api/profile   -> { learner: LearnerProfile, procrastination: ProcrastinationProfile }
// DELETE /api/profile -> { ok: true }   // 一键删除(合规)
// GET  /api/export    -> application/json(全量用户数据)
// GET  /api/smoke     -> { model: string, reply: string }
