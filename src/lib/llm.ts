// LLM 接入层:OpenAI 兼容接口(可切换 DeepSeek/Qwen/GLM);无 Key 或调用失败时降级到确定性 MockLLM
export interface LLM {
  chatJSON<T>(system: string, user: string, schemaHint: string): Promise<T>;
}

export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** 确定性伪随机(同 seed 同序列),MockLLM/兜底模板共用,保证同输入同输出 */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

export class MockLLM implements LLM {
  async chatJSON<T>(system: string, user: string, schemaHint: string): Promise<T> {
    const rng = new Rng(hashString(`${system}\u0000${user}\u0000${schemaHint}`));
    let out: unknown;
    if (/startCard/i.test(schemaHint) || /DecomposeResult/.test(schemaHint)) {
      out = mockDecompose(user, rng);
    } else if (/CoachPlan/.test(schemaHint) || /"weeks"/.test(schemaHint)) {
      out = mockCoachPlan(user, rng);
    } else if (/summary/.test(schemaHint) || /ReviewResult/.test(schemaHint)) {
      out = mockSummary(user, rng);
    } else {
      out = { reply: rng.pick(MOCK_REPLIES) };
    }
    return out as T;
  }
}

class OpenAICompatibleLLM implements LLM {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async chatJSON<T>(system: string, user: string, schemaHint: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\n输出严格 JSON(不要 markdown 代码块):${schemaHint}` },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}:${(await res.text()).slice(0, 200)}`);
    }
    const data: unknown = await res.json();
    const content = extractContent(data);
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("LLM 返回内容为空");
    }
    return parseJSONLoose(content) as T;
  }
}

function extractContent(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function parseJSONLoose(text: string): unknown {
  // 部分模型即使指定 json_object 也会包 markdown 围栏,统一剥掉
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  return JSON.parse(t) as unknown;
}

/** 当前是否运行于内置 Mock(无模型 Key)——Mock 模式下应直接用确定性模板,不走 LLM 归一化 */
export function isMockLLM(): boolean {
  return !process.env.OPENAI_API_KEY;
}

export function getLLM(): LLM {
  const key = process.env.OPENAI_API_KEY;
  if (key && key.trim().length > 0) {
    const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = process.env.MODEL_NAME ?? "deepseek-chat";
    return new OpenAICompatibleLLM(key.trim(), base, model);
  }
  return new MockLLM();
}

/** 真实 LLM 调用失败(网络/超时/解析)时自动降级 MockLLM,调用方拿到的一定是结果而非异常 */
export async function chatJSONWithFallback<T>(
  system: string,
  user: string,
  schemaHint: string
): Promise<T> {
  try {
    return await getLLM().chatJSON<T>(system, user, schemaHint);
  } catch (err) {
    console.warn("[llm] 调用失败,降级 MockLLM:", err instanceof Error ? err.message : err);
    return await new MockLLM().chatJSON<T>(system, user, schemaHint);
  }
}

// ===== MockLLM 内容库(离线演示用,确定性) =====

const MOCK_REPLIES: readonly string[] = [
  "微习惯的原理:把行动缩小到「小到不可能失败」的最小单位(例如每天 2 分钟),用极低的启动门槛换取持续的复利。",
  "微习惯=极低门槛+固定触发:先保证「每天都开始」,强度会随成功经验自然生长。",
  "神经科学上,重复的微小行动会绕过意志力对抗,直接把行为写进基底节的自动程序。",
  "微习惯的关键不是做多少,而是让「开始」变得毫不费力——身份认同由每一次微小完成投票产生。",
];

function firstMatch(re: RegExp, user: string): string | null {
  const m = re.exec(user);
  return m && m[1] ? m[1].trim() : null;
}

function mockDecompose(user: string, rng: Rng): unknown {
  const task =
    firstMatch(/「(.+?)」/, user) ?? firstMatch(/任务[:：]\s*([^\n]+)/, user) ?? "这件事";
  const short = task.slice(0, 24);
  const mood = firstMatch(/情绪[:：]\s*([^\n]{1,8})/, user);
  const blocker = rng.pick([
    "模糊型",
    "畏难型",
    "完美主义型",
    "动力型",
    "环境型",
    "疲劳型",
  ]);
  const empathyBank: Record<string, string> = {
    模糊型: "这件事还没被拆开,大脑把它当成「一大团」来抗拒很正常——不是懒,是任务还不够具体。",
    畏难型: "觉得难说明你在乎结果。现在不要求做好,只要求开始 2 分钟,难度会随接触自动下降。",
    完美主义型: "先允许一个 60 分的烂开始:草稿可以很糟,有糟的版本才有得改。",
    动力型: "动力不是等来的,是开始之后才出现的。先让身体动起来 2 分钟。",
    环境型: "环境不给力确实消耗人。我们用固定的「如果-那么」场景把干扰隔离出去。",
    疲劳型: "现在精力不足,那就别硬扛。把任务缩到今天能承受的最小份,做完就休息。",
  };
  const base = [
    { title: `只打开工具,把「${short}」写在今天清单第一行`, minutes: 2 },
    { title: `花 2 分钟只看「${short}」的要求或目录,不动手`, minutes: 2 },
    { title: `做第一个最小动作:写下「${short}」的第一行`, minutes: 5 },
    { title: `顺着做 5 分钟,做到哪算哪,允许烂开始`, minutes: 5 },
    { title: `收尾 1 分钟:记下停在哪,明天从哪开始`, minutes: 2 },
  ];
  const steps = base.slice(0, rng.int(3, 5));
  return {
    blocker,
    empathy: `${mood ? `我注意到你现在的状态是「${mood}」,先看见它,不必赶走它。` : ""}${empathyBank[blocker]}`,
    steps,
    startCard: {
      firstStep: steps[0].title,
      minutes: 2,
      doneCriteria: `能在清单或便签上看到「${short}」写在第一行`,
      intent: `如果到了今晚 20:00 在书桌前,我就花 2 分钟完成「${steps[0].title}」`,
    },
  };
}

function mockCoachPlan(user: string, rng: Rng): unknown {
  const weeksMatch = /weeks[=:：]\s*(\d{1,2})/.exec(user);
  const weeks = weeksMatch ? Math.min(12, Math.max(1, Number(weeksMatch[1]))) : 4;
  const goal = (firstMatch(/目标[:：]\s*([^\n]+)/, user) ?? "学习目标").slice(0, 16);
  const focusBank = ["环境与最小启动", "基础刻意练习", "组合应用与流畅度", "小项目实战", "复盘与进阶"];
  const weeksOut: { focus: string; days: { tasks: { title: string; minutes: number; granularity: number }[] }[] }[] = [];
  for (let w = 1; w <= weeks; w++) {
    const base = focusBank[(w - 1) % focusBank.length];
    const focus = w > focusBank.length ? `${base}(第${Math.ceil(w / focusBank.length)}轮)` : base;
    const days: { tasks: { title: string; minutes: number; granularity: number }[] }[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 1) {
        days.push({
          tasks: [{ title: `微启动:${goal}(第${d + 1}天)`, minutes: d < 3 ? 2 : 5, granularity: d < 3 ? 2 : 5 }],
        });
      } else {
        const count = rng.int(1, 2);
        const tasks: { title: string; minutes: number; granularity: number }[] = [];
        for (let n = 0; n < count; n++) {
          tasks.push({ title: `${goal}·${base}练习${n + 1}`, minutes: rng.int(10, 25), granularity: 10 });
        }
        days.push({ tasks });
      }
    }
    weeksOut.push({ focus, days });
  }
  return {
    weeks: weeksOut,
    notes: [
      "首周按「最低可持续」原则:每天只安排 1 个微任务,先建立连续启动的记录。",
      `从第 2 周起逐步装载任务量,围绕「${goal}」推进,打卡数据会反过来调整粒度。`,
    ],
  };
}

function mockSummary(user: string, rng: Rng): unknown {
  const n = Number(firstMatch(/共打卡 (\d+) 次/, user) ?? 0);
  const delay = Number(firstMatch(/平均启动延迟 ([\d.]+) 分钟/, user) ?? 0);
  const rate = Number(firstMatch(/启动成功率 (\d+)%/, user) ?? 0);
  return {
    summary: [
      `本周期共打卡 ${n} 次,平均启动延迟 ${delay} 分钟。`,
      rate >= 50
        ? `启动成功率 ${rate}%,启动状态稳定,可维持当前任务粒度。`
        : `启动成功率 ${rate}%,启动阻力偏大,建议把任务粒度降到 2 分钟。`,
      n === 0
        ? "先完成一次 2 分钟的最小启动,让数据开始积累。"
        : rng.pick([
            "继续保持「每天都开始」的记录,低谷日会被自动减载。",
            "启动延迟在收敛,说明拆解粒度与你的状态是匹配的。",
            "节奏重于强度:先守住连续的小胜利,再谈加量。",
          ]),
    ],
  };
}
