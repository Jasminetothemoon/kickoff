// 对话球路由:意图识别 → 分发到四 Agent(轻量路由器,结构对齐 LangGraph 状态图:
// router 节点判定 intent,四条边分别到 Coach/Spark/Pace/Mirror 节点)
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, errorMessage, parseJSONBody, zodErrorMessage } from "@/lib/api";
import { currentUserId, ensureDemoUser, prisma } from "@/lib/db";
import { chatJSONWithFallback } from "@/lib/llm";
import { decompose } from "@/lib/agents/spark";
import { review } from "@/lib/agents/mirror";
import { celebrate, detectTone, reminder, toneLabel } from "@/lib/agents/pace";
import { getProfile, suggestGranularity } from "@/lib/profile";
import { loadPlansForGoal } from "@/lib/planStore";
import { todayStr } from "@/lib/datetime";
import { CRISIS_REPLY, detectCrisis } from "@/lib/crisis";

export const dynamic = "force-dynamic";

type Intent = "decompose" | "plan" | "review" | "profile" | "motivate" | "chat";
type AgentName = "Coach" | "Spark" | "Pace" | "Mirror";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500),
  mood: z.string().max(20).optional(),
});

/** 意图路由:LLM 判定 + 关键词兜底(Mock 可确定性路由常用语) */
async function routeIntent(message: string): Promise<Intent> {
  const kw: [Intent, string[]][] = [
    ["decompose", ["拆", "拆解", "步骤", "开始", "启动", "第一步", "怎么做", "大象"]],
    ["plan", ["计划", "安排", "本周", "这周", "周计划", "学什么"]],
    ["review", ["复盘", "总结", "回顾", "报告"]],
    ["profile", ["画像", "我的数据", "成功率", "粒度", "卡点"]],
    ["motivate", ["没动力", "不想", "焦虑", "累", "烦", "坚持不下去", "鼓励", "难"]],
  ];
  for (const [intent, words] of kw) {
    if (words.some((w) => message.includes(w))) return intent;
  }
  try {
    const r = await chatJSONWithFallback<{ intent: Intent }>(
      "你是意图路由器。把用户消息分类为 decompose(想拆解/开始任务)、plan(问计划)、review(要复盘)、profile(问画像数据)、motivate(缺动力/情绪)、chat(其他闲聊)。只输出 JSON。",
      message,
      '{"intent":"decompose|plan|review|profile|motivate|chat"}'
    );
    const ok: Intent[] = ["decompose", "plan", "review", "profile", "motivate", "chat"];
    return ok.includes(r?.intent) ? r.intent : "chat";
  } catch {
    return "chat";
  }
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await parseJSONBody(request));
    if (!parsed.success) {
      return apiError(`请求参数不合法:${zodErrorMessage(parsed.error)}`, 400);
    }
    const { message, mood } = parsed.data;
    await ensureDemoUser();
    // 伦理护栏:危机信号优先于一切路由 —— 停止普通流程,转介专业资源
    if (detectCrisis(message)) {
      return NextResponse.json({ agent: "Pace", reply: CRISIS_REPLY, crisis: true });
    }
    const intent = await routeIntent(message);

    // ===== Spark:拆解 / 启动 =====
    if (intent === "decompose") {
      const result = await decompose(message, mood);
      return NextResponse.json({
        agent: "Spark",
        reply: `${result.empathy}\n我把它拆好了,第一步只要 ${result.startCard.minutes} 分钟 👇`,
        data: { startCard: result.startCard, steps: result.steps },
      });
    }

    // ===== Coach:本周计划概览 =====
    if (intent === "plan") {
      const goal = await prisma.goal.findFirst({
        where: { userId: await currentUserId() },
        orderBy: { createdAt: "desc" },
      });
      if (!goal) {
        return NextResponse.json({
          agent: "Coach",
          reply: "还没有目标哦 — 去「今天」页点「生成我的学习计划」,一句话写下你想学什么,我来排。",
        });
      }
      const plans = await loadPlansForGoal(goal.id);
      const today = todayStr();
      const current =
        plans.find((p) => p.days.some((d) => d.date === today)) ?? plans[plans.length - 1];
      const undone = current.days.flatMap((d) => d.tasks).filter((t) => !t.done).length;
      const todayTasks = current.days.find((d) => d.date === today)?.tasks ?? [];
      return NextResponse.json({
        agent: "Coach",
        reply:
          `目标:${goal.title}\n本周重点:${current.focus}\n` +
          `今天 ${todayTasks.length} 个任务${todayTasks[0] ? `,第一个:${todayTasks[0].title}(${todayTasks[0].minutes} 分钟)` : ""}\n` +
          `本周还剩 ${undone} 个未完成任务 — 低谷日会自动减载,放心。`,
      });
    }

    // ===== Mirror:复盘 =====
    if (intent === "review") {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await prisma.checkIn.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: "desc" },
        take: 50,
      });
      const result = await review(
        rows.length >= 1 ? "week" : "day",
        rows.map((r) => ({
          taskId: r.taskId,
          taskTitle: r.taskTitle,
          granularity: r.granularity,
          mood: r.mood,
          delaySeconds: r.delaySeconds,
          startedAt: r.startedAt.toISOString(),
          completed: r.completedAt !== null,
        }))
      );
      return NextResponse.json({
        agent: "Mirror",
        reply: result.summary.join("\n"),
      });
    }

    // ===== Mirror:画像数据 =====
    if (intent === "profile") {
      const dual = await getProfile(await currentUserId());
      const gran = suggestGranularity(dual.procrastination);
      const top = Object.entries(dual.procrastination.blockerDist ?? {})
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 2)
        .map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`)
        .join(" / ");
      return NextResponse.json({
        agent: "Mirror",
        reply:
          `你的拖延画像:主要卡点 ${top || "数据积累中"}\n` +
          `当前建议粒度:${gran} 分钟(按启动成功率自动升降)\n` +
          `平均启动延迟:${dual.procrastination.avgStartDelayMin.toFixed(1)} 分钟\n详细矩阵在「画像」页 🪞`,
      });
    }

    // ===== Pace:动力急救 =====
    if (intent === "motivate") {
      const dual = await getProfile(await currentUserId());
      const tone = detectTone(dual.procrastination);
      const opener: Record<string, string> = {
        gentle: "先别逼自己 —— 你的卡点多是「怕做不好」,今天允许烂开始。",
        connect: "想想你为什么开始这件事 —— 目标不是任务,是你想成为的人。",
        drill: "没动力很正常,拖延是情绪调节,不是懒。",
      };
      const line = reminder({
        firstStep: "打开你正在学的那个东西,只做 2 分钟",
        minutes: 2,
        doneCriteria: "开始了就算",
        intent: "",
      });
      return NextResponse.json({
        agent: "Pace",
        reply:
          `${mood ? `我听到你说「${mood}」了 — ` : ""}${opener[tone]}\n` +
          `${line}\n只做 2 分钟,到时想停就停 — 我陪你 🟢(当前督促语气:${toneLabel(tone)})`,
      });
    }

    // ===== 兜底闲聊 =====
    return NextResponse.json({
      agent: "Pace",
      reply:
        "我在 🟢 可以试着对我说:「帮我拆解 <任务>」「看看我的计划」「复盘一下这周」「我完全没动力」— 小队随时在。",
    });
  } catch (err) {
    return apiError(`对话失败:${errorMessage(err)}`, 500);
  }
}
