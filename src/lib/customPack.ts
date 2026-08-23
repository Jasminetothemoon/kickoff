// 自定义技能包生成器:任意技能 + 用户自带资源(视频/教程链接/教材/线下要点)
// → 生成专属 SkillPack(周模板,任务可携带资源链接),落库 CustomSkillPack
import { prisma } from "./db";
import { chatJSONWithFallback } from "./llm";
import type { SkillPack, SkillPackTaskTemplate, SkillPackWeekTemplate } from "./skillpack";

export interface CustomPackInput {
  userId: string;
  goalTitle: string; // 技能/目标,如「自学吉他弹唱」
  resources: string[]; // 每行一条:URL(视频/教程)/书名/线下要点
  motivation?: string;
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim()) || s.includes(".com") || s.includes(".cn") || s.includes("bilibili");
}

/** 从资源串中解析出链接类与文字类 */
export function parseResources(resources: string[]): { links: { title: string; url: string }[]; notes: string[] } {
  const links: { title: string; url: string }[] = [];
  const notes: string[] = [];
  for (const raw of resources) {
    const r = raw.trim();
    if (!r) continue;
    const m = r.match(/(https?:\/\/[^\s,，]+)/i);
    if (m) {
      links.push({ title: r.replace(m[1], "").replace(/[\s,，:：-]+$/, "") || m[1].slice(0, 28), url: m[1] });
    } else if (isUrl(r)) {
      links.push({ title: r.slice(0, 28), url: r.startsWith("http") ? r : `https://${r}` });
    } else {
      notes.push(r);
    }
  }
  return { links, notes };
}

/** Mock 兜底:确定性模板(不联网)——微启动 → 资源熟悉 → 交替练习 → 输出复盘 */
function mockPack(title: string, links: { title: string; url: string }[], notes: string[]): SkillPack {
  const t = title.slice(0, 12);
  const first = links[0];
  const weeks: SkillPackWeekTemplate[] = [
    {
      week: 1,
      focus: `微启动周:先见到「${t}」长什么样`,
      tasks: [
        { title: `打开工具,把「${t}」写在今天清单第一行`, minutes: 2 },
        ...(first ? [{ title: `收藏并打开第一个资源:${first.title}`, minutes: 3, link: first.url, linkTitle: first.title }] : []),
        { title: `把 ${notes.length || links.length} 个资源整理成一个清单(标题+一句话)`, minutes: 5 },
        { title: `只看/只听第一个资源的前 5 分钟,不求懂`, minutes: 5 },
        { title: `写下关于「${t}」的 3 个具体问题`, minutes: 5 },
        { title: "查资料回答其中 1 个问题", minutes: 10 },
      ],
    },
    {
      week: 2,
      focus: "建立节奏:资源输入 + 最小练习交替",
      tasks: [
        ...(first ? [{ title: `按资源目录学到下一小节:${first.title}`, minutes: 15, link: first.url, linkTitle: first.title }] : [{ title: `选一个「${t}」核心概念学 10 分钟`, minutes: 10 }]),
        { title: `围绕刚才的内容做一个最小练习(动手/动口/动笔)`, minutes: 10 },
        ...(links[1] ? [{ title: `开始第二个资源:${links[1].title}`, minutes: 10, link: links[1].url, linkTitle: links[1].title }] : []),
        ...(notes[0] ? [{ title: `线下要点实践:${notes[0].slice(0, 16)}`, minutes: 15 }] : []),
        { title: "复习昨天的内容(不看笔记复述一遍)", minutes: 5 },
      ],
    },
    {
      week: 3,
      focus: "深入与输出:学进去,讲出来",
      tasks: [
        { title: `挑选「${t}」的一个子主题深入`, minutes: 15 },
        { title: "把子主题讲给想象中的新手听(费曼法)", minutes: 10 },
        ...(notes[1] ? [{ title: `线下要点实践:${notes[1].slice(0, 16)}`, minutes: 15 }] : [{ title: "做一个 15 分钟综合练习", minutes: 15 }]),
        { title: "写一篇 300 字学习笔记", minutes: 15 },
      ],
    },
    {
      week: 4,
      focus: "小成果与复盘",
      tasks: [
        { title: `规划一个「${t}」最小可展示成果`, minutes: 10 },
        { title: "完成成果的第一版", minutes: 20 },
        { title: "迭代一次:改进一个点", minutes: 15 },
        { title: "复盘:写下 3 条「下次开始更快」的经验", minutes: 10 },
      ],
    },
  ];
  return { id: `custom-${Date.now().toString(36)}`, title: `${t}(专属路线)`, weeks };
}

const SYSTEM = [
  "你是 Kickoff 的 Coach。用户想学一个任意技能,并提供了自己的资源(视频/教程链接、教材、线下要点)。",
  "请生成 4 周学习路线模板(JSON):week1 微启动(每天≤5分钟,先熟悉资源);week2 资源输入与最小练习交替;week3 深入+费曼输出;week4 最小成果+复盘。",
  "要求:任务标题具体可执行(≤20字);凡源自某个链接资源的任务必须带 link(该资源URL)与 linkTitle;线下/动手任务不带 link;每周 5-6 个任务,分钟数 2-30。",
  "物理世界技能(乐器/运动/手工等)以「动手练习」任务为主,资源任务为辅。",
].join("\n");

const SCHEMA_HINT =
  '{"weeks":[{"week":1,"focus":"...","tasks":[{"title":"...","minutes":5,"link":"https://... 可选","linkTitle":"... 可选"}]}]}';

interface LLMWeek {
  week?: number;
  focus?: string;
  tasks?: { title?: string; minutes?: number; link?: string; linkTitle?: string }[];
}

/** 主入口:LLM 生成 → 校验/兜底 Mock → 落库 */
export async function generateCustomPack(input: CustomPackInput): Promise<SkillPack> {
  const { links, notes } = parseResources(input.resources);
  let pack: SkillPack | null = null;
  try {
    const r = await chatJSONWithFallback<{ weeks: LLMWeek[] }>(
      SYSTEM,
      `技能目标:${input.goalTitle}\n动机:${input.motivation || "无"}\n链接资源:${JSON.stringify(links)}\n文字/线下资源:${JSON.stringify(notes)}`,
      SCHEMA_HINT
    );
    const weeks: SkillPackWeekTemplate[] = (r?.weeks ?? [])
      .filter((w) => w && typeof w.focus === "string" && Array.isArray(w.tasks))
      .map((w, i) => ({
        week: i + 1,
        focus: String(w.focus).slice(0, 30),
        tasks: (w.tasks ?? [])
          .filter((t) => t && typeof t.title === "string" && t.title.length > 1)
          .slice(0, 8)
          .map<SkillPackTaskTemplate>((t) => ({
            title: String(t.title).slice(0, 30),
            minutes: Math.max(2, Math.min(30, Math.round(Number(t.minutes) || 10))),
            ...(typeof t.link === "string" && /^https?:\/\//.test(t.link) ? { link: t.link, linkTitle: String(t.linkTitle || t.link).slice(0, 30) } : {}),
          })),
      }))
      .filter((w) => w.tasks.length > 0);
    if (weeks.length >= 2) pack = { id: `custom-${Date.now().toString(36)}`, title: `${input.goalTitle.slice(0, 12)}(专属路线)`, weeks };
  } catch {
    // 落到 mock
  }
  if (!pack) pack = mockPack(input.goalTitle, links, notes);

  await prisma.customSkillPack.create({
    data: {
      userId: input.userId,
      title: input.goalTitle.slice(0, 60),
      keywords: input.goalTitle.split(/\s+/).filter((k) => k.length >= 2).join(","),
      pack: JSON.stringify(pack),
    },
  });
  return pack;
}

/** 读取用户的自定义包(按标题/关键词命中) */
export async function findCustomPack(userId: string, goalTitle: string): Promise<SkillPack | null> {
  const rows = await prisma.customSkillPack.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const lower = goalTitle.toLowerCase();
  for (const r of rows) {
    const hit =
      lower.includes(r.title.toLowerCase().slice(0, 6)) ||
      r.keywords.split(",").some((k) => k.trim().length >= 2 && lower.includes(k.trim().toLowerCase()));
    if (hit) {
      try {
        const p = JSON.parse(r.pack) as SkillPack;
        if (Array.isArray(p.weeks) && p.weeks.length > 0) return p;
      } catch {
        // 损坏则跳过
      }
    }
  }
  return null;
}
