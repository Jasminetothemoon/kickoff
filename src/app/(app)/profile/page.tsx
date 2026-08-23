"use client";
// 「画像」:卡点类型分布条形图 + 启动成功率×粒度矩阵 + 本周复盘 · Mirror(POST /api/review)
// + 杂念停车场(GET /api/park,失败隐藏整卡)+ 数据自主权(导出/删除)
import { useEffect, useMemo, useState } from "react";
import type { LearnerProfile, ProcrastinationProfile, ReviewResult } from "@/lib/types";
import { DEMO_PROFILE, DEMO_REVIEW, postJson } from "@/components/data";
import AgentAvatar from "@/components/AgentAvatar";
import { showToast } from "@/components/Toast";

type ProfileApi = { learner: LearnerProfile; procrastination: ProcrastinationProfile };
// 后端契约在 ReviewResult 上附带 applied(已自动落库的调整说明)
type WeekReview = ReviewResult & { applied?: string[] };
type ParkItem = { id: string; text: string; createdAt: string };
// 成就墙契约(GET /api/achievements;失败 → null → 整卡隐藏,不白屏)
type AchievementsApi = {
  points: number; // 起飞值
  unlocked: { key: string; title: string; desc?: string; icon: string; unlockedAt: string }[];
  next: { key: string; title: string; desc?: string; icon: string; progress: number; goal: number }[]; // 离点亮最近的一批
};

const BLOCKER_LABEL: Record<string, string> = { 完美主义型: "完美主义" };
const BAR_COLORS = ["var(--indigo)", "var(--orange)", "var(--teal)", "var(--muted)", "var(--amber)"];
const GRANS = ["2", "5", "10", "15"] as const;
const WEEKDAY_ALL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const ERROR_KIND_COLOR: Record<string, { bg: string; fg: string }> = {
  知识: { bg: "var(--indigo-l)", fg: "var(--indigo)" },
  习惯: { bg: "var(--teal-l)", fg: "var(--teal)" },
  情绪: { bg: "var(--amber-l)", fg: "var(--amber)" },
};

// API 不可用时的演示兜底(与旧静态卡片一致)
const DEMO_WEEK_REVIEW: WeekReview = {
  summary: DEMO_REVIEW,
  errorTypes: [],
  planAdjustments: [],
  applied: [],
  profileDelta: {},
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProfileApi>(DEMO_PROFILE);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [review, setReview] = useState<WeekReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [parkItems, setParkItems] = useState<ParkItem[] | null>(null); // null = 请求失败,隐藏整卡
  const [ach, setAch] = useState<AchievementsApi | null>(null); // null = 成就接口失败,隐藏整卡

  useEffect(() => {
    let alive = true;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ProfileApi) => {
        if (alive && d?.learner && d?.procrastination) setData(d);
      })
      .catch(() => {
        // 演示数据兜底
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 杂念停车场:拉最近条目;失败保持 null → 整卡隐藏
  useEffect(() => {
    let alive = true;
    fetch("/api/park")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { items?: ParkItem[] }) => {
        if (alive && d && Array.isArray(d.items)) setParkItems(d.items.slice(0, 5));
      })
      .catch(() => {
        // 隐藏整卡,不白屏
      });
    return () => {
      alive = false;
    };
  }, []);

  // 成就墙 · 起飞值:契约校验通过才显示;接口不可用/字段缺失 → 保持 null,整卡隐藏
  useEffect(() => {
    let alive = true;
    fetch("/api/achievements")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: AchievementsApi) => {
        if (
          alive &&
          d &&
          typeof d.points === "number" &&
          Array.isArray(d.unlocked) &&
          Array.isArray(d.next)
        ) {
          setAch({
            points: d.points,
            unlocked: d.unlocked.filter((b) => b && typeof b.key === "string"),
            next: d.next
              .filter((n) => n && typeof n.key === "string")
              .slice(0, 3), // 未解锁中离点亮最近的
          });
        }
      })
      .catch(() => {
        // 静默降级:隐藏整卡
      });
    return () => {
      alive = false;
    };
  }, []);

  const blockers = useMemo(() => {
    const entries = Object.entries(data.procrastination.blockerDist ?? {}).filter(
      ([, v]) => typeof v === "number",
    ) as [string, number][];
    const sum = entries.reduce((n, [, v]) => n + v, 0) || 1;
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({
        label: BLOCKER_LABEL[k] ?? k,
        pct: Math.round((v / sum) * 100),
      }));
  }, [data]);

  const matrix = useMemo(
    () =>
      GRANS.map((g) => {
        const e = data.procrastination.successByGran?.[g];
        const rate = e && e.total > 0 ? e.success / e.total : null;
        return { g, rate, n: e ? `${e.success}/${e.total}` : "-" };
      }),
    [data],
  );

  const conclusion = useMemo(() => {
    const goods = matrix.filter((m) => m.rate !== null && m.rate >= 0.66).map((m) => m.g);
    const bads = matrix.filter((m) => m.rate !== null && m.rate < 0.5).map((m) => m.g);
    if (goods.length === 0) return "结论:各粒度成功率都还不稳定 — Coach 正在为你继续下调粒度";
    const badPart = bads.length ? `;${bads.join("/")} 分钟任务持续失败,已自动下调并换策略` : "";
    return `结论:你目前最适合 ${goods.join("-")} 分钟粒度${badPart}`;
  }, [matrix]);

  const hours = [...(data.procrastination.activeHours ?? [])].sort((a, b) => a - b);
  const activeText = hours.length >= 2 ? `${hours[0]}–${hours[hours.length - 1]} 点` : hours.length === 1 ? `${hours[0]} 点` : "待记录";
  const lowText = (data.procrastination.lowDays ?? []).map((d) => WEEKDAY_ALL[d] ?? "").filter(Boolean).join("/");

  const genReview = async () => {
    if (reviewing) return;
    setReviewing(true);
    try {
      const r = await postJson<WeekReview>("/api/review", { scope: "week" });
      setReview(r && Array.isArray(r.summary) ? r : DEMO_WEEK_REVIEW);
    } catch {
      // API 不可用:演示数据兜底,不白屏
      setReview(DEMO_WEEK_REVIEW);
    } finally {
      setReviewing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确定删除全部画像数据吗?此操作不可恢复。")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDeleted(true);
      showToast("已删除全部画像数据");
    } catch {
      showToast("删除失败,请稍后再试");
    } finally {
      setDeleting(false);
    }
  };

  if (deleted) {
    return (
      <>
        <div className="hello">
          Mirror · 每周复盘
          <b>你的大脑使用说明书</b>
        </div>
        <div className="empty">
          画像已清空 🌱
          <br />
          新的打卡与拆解会重新开始积累 — 从 2 分钟的第一步开始就好
        </div>
      </>
    );
  }

  return (
    <>
      <div className="hello">
        Mirror · 每周复盘
        <b>你的大脑使用说明书</b>
      </div>

      {loading && (
        <div className="card">
          <div className="skeleton" style={{ width: "42%", height: 12, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: "80%" }} />
        </div>
      )}

      {/* 成就墙 · 起飞值:仅接口可用时显示;进度条只用于「下一批」,语气庆祝开始与回来 */}
      {ach && (
        <div className="card fade-in">
          <span className="tag t-amber">成就 · 起飞值</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>
              🪁
            </span>
            <b
              style={{
                fontSize: 34,
                lineHeight: 1,
                fontWeight: 800,
                color: "var(--indigo)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ach.points}
            </b>
            {/* Spark 小火箭:每一次「开始」都在给起飞值加燃料 */}
            <AgentAvatar agent="Spark" size={18} />
            <span className="sub">起飞值 · 每一次开始都在积累</span>
          </div>

          <h3 style={{ marginTop: 12 }}>
            已点亮{ach.unlocked.length > 0 ? ` · ${ach.unlocked.length} 枚` : ""}
          </h3>
          {ach.unlocked.length === 0 ? (
            <div className="empty" style={{ padding: "16px 12px", fontSize: 11.5 }}>
              完成第一次打卡,徽章就会在这里亮起
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                marginTop: 8,
                paddingBottom: 4,
                scrollbarWidth: "none",
              }}
            >
              {ach.unlocked.map((b) => {
                const rt = relTime(b.unlockedAt ?? "");
                return (
                  <div
                    key={b.key}
                    title={b.desc || b.title}
                    style={{
                      flex: "none",
                      width: 88,
                      borderRadius: 12,
                      border: "1px solid var(--line)",
                      background: "var(--bg)",
                      padding: "10px 6px 8px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 22, lineHeight: 1 }}>{b.icon || "🏅"}</div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        marginTop: 5,
                        lineHeight: 1.35,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.title}
                    </div>
                    {rt ? <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2 }}>{rt}</div> : null}
                  </div>
                );
              })}
            </div>
          )}

          {ach.next.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>下一批 · 正在路上</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 8 }}>
                {ach.next.map((n) => {
                  const goal = typeof n.goal === "number" && n.goal > 0 ? n.goal : 0;
                  const prog =
                    typeof n.progress === "number" && n.progress > 0 ? Math.min(n.progress, goal || n.progress) : 0;
                  const pct = goal > 0 ? Math.min(100, Math.round((prog / goal) * 100)) : 0;
                  return (
                    <div key={n.key} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ flex: "none", fontSize: 18, lineHeight: 1.3 }} aria-hidden>
                        {n.icon || "🏅"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                          <b style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.4 }}>{n.title}</b>
                          {goal > 0 && (
                            <span
                              style={{
                                flex: "none",
                                fontSize: 10.5,
                                color: "var(--muted)",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {prog} / {goal}
                            </span>
                          )}
                        </div>
                        {n.desc ? <div className="sub">{n.desc}</div> : null}
                        {goal > 0 && (
                          <div className="track" style={{ marginTop: 6 }}>
                            <div className="fill" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <span className="tag t-indigo">拖延画像</span>
        <h3 style={{ marginTop: 6 }}>卡点类型分布(近 14 天)</h3>
        <div className="bars">
          {blockers.map((b, i) => (
            <div className="bar-row" key={b.label}>
              <span>{b.label}</span>
              <div className="bar">
                <i style={{ width: `${b.pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
              </div>
              <span>{b.pct}%</span>
            </div>
          ))}
        </div>
        <div className="sub mt10">
          启动延迟中位数 {data.procrastination.avgStartDelayMin} 分钟 · 高效时段 {activeText}
          {lowText ? ` · 低谷日 ${lowText}` : ""}
        </div>
      </div>

      <div className="card">
        <span className="tag t-orange">粒度自适应矩阵</span>
        <h3 style={{ marginTop: 6 }}>启动成功率 × 任务粒度</h3>
        <div className="matrix">
          {matrix.map((m) => {
            const cls = m.rate === null ? "" : m.rate >= 0.66 ? "good" : m.rate < 0.5 ? "bad" : "";
            return (
              <div className={cls} key={m.g}>
                <b>{m.rate === null ? "-" : `${Math.round(m.rate * 100)}%`}</b>
                {m.g} 分钟
              </div>
            );
          })}
        </div>
        <div className="sub mt10">{conclusion}</div>
      </div>

      <div className="card">
        <span className="tag t-teal">学习者画像</span>
        <h3 style={{ marginTop: 6 }}>{data.learner.goal}</h3>
        <div className="sub">动机:{data.learner.motivation}</div>
        <div className="bars mt10">
          {Object.entries(data.learner.mastery ?? {}).map(([k, v]) => (
            <div className="bar-row" key={k}>
              <span>{k}</span>
              <div className="bar">
                <i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: "var(--teal)" }} />
              </div>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="sub mt10">历史完成率 {Math.round((data.learner.historyCompletion ?? 0) * 100)}%</div>
      </div>

      {/* 本周复盘 · Mirror:按钮触发生成,渲染 summary / 错因徽章 / 已自动调整 */}
      <div className="card">
        <span className="tag t-teal">本周复盘 · Mirror</span>
        {/* Mirror(自带眨眼/闪光)持镜守在复盘标题旁 */}
        <h3 style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <AgentAvatar agent="Mirror" size={26} />
          这周,你的大脑发生了什么
        </h3>
        <div className="sub mt6">基于本周的打卡、拆解与冲刺数据生成,带 ✓ 的都已核对过</div>
        <button
          className="btn btn-indigo mt10"
          style={{ padding: 12, fontSize: 13 }}
          onClick={genReview}
          disabled={reviewing}
        >
          {reviewing ? "生成中…" : review ? "重新生成" : "生成周复盘"}
        </button>

        {review && (
          <div className="mt10 fade-in">
            {(review.summary ?? []).length > 0 ? (
              <ul className="review">
                {(review.summary ?? []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <div className="empty" style={{ padding: "18px 14px", fontSize: 11.5 }}>
                打卡几次后,这里会长出你的复盘
              </div>
            )}

            {review.errorTypes && review.errorTypes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {review.errorTypes.map((e, i) => {
                  const c = ERROR_KIND_COLOR[e.kind] ?? { bg: "var(--bg)", fg: "var(--muted)" };
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span
                        style={{
                          flex: "none",
                          background: c.bg,
                          color: c.fg,
                          fontSize: 10.5,
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 999,
                          lineHeight: 1.4,
                        }}
                      >
                        {e.kind}
                      </span>
                      <span style={{ fontSize: 11.5, color: "var(--slate)", lineHeight: 1.55 }}>{e.note}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {review.applied && review.applied.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {review.applied.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span
                      style={{
                        flex: "none",
                        background: "var(--orange-l)",
                        color: "var(--orange)",
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 999,
                        lineHeight: 1.4,
                      }}
                    >
                      已自动调整
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--slate)", lineHeight: 1.55 }}>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 杂念停车场:仅在接口可用时显示 */}
      {parkItems && (
        <div className="card">
          <span className="tag t-indigo">杂念停车场</span>
          <h3 style={{ marginTop: 6 }}>脑外缓存区</h3>
          {parkItems.length === 0 ? (
            <div className="sub mt6">计时中冒出的杂念会停在这里,不占用脑内内存</div>
          ) : (
            <ul className="review">
              {parkItems.map((it) => {
                const rt = relTime(it.createdAt);
                return (
                  <li key={it.id}>
                    {it.text}
                    {rt ? <span style={{ color: "var(--muted)" }}> · {rt}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <div className="fresh">
          <a className="fb1" href="/api/export" download="kickoff-data.json">
            导出我的数据
          </a>
          <button className="fb2" onClick={handleDelete} disabled={deleting}>
            {deleting ? "删除中…" : "一键删除"}
          </button>
        </div>
        <div className="sub mt10" style={{ textAlign: "center" }}>
          画像属于你:随时查看、纠错、带走或删除
        </div>
      </div>
    </>
  );
}
