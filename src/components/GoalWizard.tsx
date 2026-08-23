"use client";
// GoalWizard:新目标创建向导(Coach 入口)——目标 / 周数 / 每日分钟 / 动机
import { useState } from "react";
import { postJson } from "@/components/data";
import { showToast } from "@/components/Toast";

export interface CreatedGoal {
  goalId: string;
}

const PRESETS = [
  { title: "三个月学会 Python 数据分析", weeks: 12, minutes: 25 },
  { title: "30 天入门 Web 开发", weeks: 4, minutes: 30 },
  { title: "六级英语词汇与阅读", weeks: 8, minutes: 20 },
];

export default function GoalWizard({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState(12);
  const [minutes, setMinutes] = useState(25);
  const [motivation, setMotivation] = useState("");
  const [resources, setResources] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) {
      showToast("先写下你想学什么 —— 一句话就够");
      return;
    }
    setBusy(true);
    try {
      const resList = resources.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 12);
      await postJson<CreatedGoal>("/api/goals", {
        title: title.trim(),
        weeks,
        minutesPerDay: minutes,
        motivation: motivation.trim(),
        resources: resList.length > 0 ? resList : undefined,
      });
      showToast("计划已生成 — 今天只需要迈出第一步 🚀");
      onCreated();
      onClose();
    } catch (err) {
      const msg = (err as { message?: string })?.message || "";
      showToast(msg.includes("HTTP") ? `创建失败(${msg})— 服务在吗?刷新重试` : "创建失败,请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="创建学习目标">
        <div className="hello">
          新目标 · Coach 规划
          <b>你想学会什么?</b>
        </div>

        <div className="card" style={{ borderLeft: "4px solid var(--indigo)" }}>
          <input
            className="input"
            placeholder="例如:三个月学会 Python 数据分析"
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <div className="sub mt6">不必完美 —— 之后 Coach 会随你的画像动态调整</div>
          <div className="chiprow mt6">
            {PRESETS.map((p) => (
              <button key={p.title} className="preset" onClick={() => {
                setTitle(p.title); setWeeks(p.weeks); setMinutes(p.minutes);
              }}>
                {p.title}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row">
            <span className="tag t-indigo">周期</span>
            <div className="stepper">
              <button onClick={() => setWeeks((w) => Math.max(2, w - 2))} aria-label="减少周数">−</button>
              <b>{weeks} 周</b>
              <button onClick={() => setWeeks((w) => Math.min(24, w + 2))} aria-label="增加周数">+</button>
            </div>
          </div>
          <div className="row mt6">
            <span className="tag t-orange">每日</span>
            <div className="stepper">
              <button onClick={() => setMinutes((m) => Math.max(10, m - 5))} aria-label="减少分钟">−</button>
              <b>{minutes} 分钟</b>
              <button onClick={() => setMinutes((m) => Math.min(60, m + 5))} aria-label="增加分钟">+</button>
            </div>
          </div>
          <div className="sub mt6">首周会按「最低可持续」自动压载 —— 先保证能开始,再谈强度</div>
        </div>

        <div className="card">
          <span className="tag t-teal">我的资源(可选 · 任意技能)</span>
          <textarea
            className="input mt6"
            style={{ height: 76, resize: "none" }}
            placeholder={"每行一条,例如:\nhttps://www.bilibili.com/video/xxx 吉他入门教程\n《吉他三月通》教材\n每周去琴行摸真琴 1 次"}
            value={resources}
            maxLength={1200}
            onChange={(e) => setResources(e.target.value)}
          />
          <div className="sub mt6">填了资源,Coach 会围绕「你的资源」生成专属路线 —— 视频/教程链接会直接挂在对应任务上;线下要点会变成练习任务</div>
        </div>

        <div className="card">
          <span className="tag t-amber">为什么学?(可选)</span>
          <input
            className="input mt6"
            placeholder="例如:完成转行作品集 / 给女儿做榜样"
            value={motivation}
            maxLength={60}
            onChange={(e) => setMotivation(e.target.value)}
          />
          <div className="sub mt6">动力型卡点出现时,Coach 会用它帮你重新联结目标</div>
        </div>

        <button className="btn btn-main" onClick={submit} disabled={busy}>
          {busy ? "Coach 正在生成计划…" : "生成我的学习计划"}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          先逛逛再说
        </button>
      </div>
    </div>
  );
}
