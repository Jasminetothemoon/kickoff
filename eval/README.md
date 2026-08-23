# Kickoff 评测(eval/)

模拟学习者数据 + 指标 + 消融基线。全部离线运行,可复现,不依赖服务器或外部 API(对应计划书 §12 评测与验收、§14 模拟数据集)。

## 如何运行

在仓库根目录执行(先完成 `npm install`,tsx 已在 devDependencies 中):

```bash
npm run sim:gen   # 生成 data/simulated/seed.json(3 个画像 × 30 天),并在 stdout 打印每人汇总
npm run eval      # 读取 seed.json → 计算指标与消融 → 生成 eval/report.md
```

产物:

- `data/simulated/seed.json` —— 模拟行为数据(mulberry32,seed=42;无时间戳,重复运行逐字节一致);
- `eval/report.md` —— 中文评测报告(主指标表、周延迟表、消融表、结论;数字保留 1 位小数)。

注意:两个脚本都以仓库根目录为工作目录(`npm run` 保证这一点);直接用 tsx 运行时也请在根目录执行。

## 数据结构(seed.json)

每天一条记录:`{ date, persona, tasks: [{ granularity: 2|5|10|15, started, delayMinutes, completed, mood }], blocker }`,其中 `delayMinutes` 为提醒→实际开始的延迟(未开始为 `null`),`blocker` 为当日卡点判定(复用 `src/lib/types.ts` 的 `BlockerType`)。三个画像:

| 画像 | 设定 |
|---|---|
| perfectionist-heavy 完美主义重度 | 卡点以完美主义型为主;15 分钟任务成功率 0.35;启动延迟高 |
| vague-light 模糊型轻度 | 卡点以模糊型为主;小粒度(2/5 分钟)成功率高 |
| adhd-lean ADHD 倾向 | 2 分钟档成功率 0.9、5 分钟档 0.8、15 分钟档 0.3;活跃时段偏晚 |

## 指标定义(eval/metrics.ts,纯函数、确定性)

| 指标 | 函数 | 定义 |
|---|---|---|
| 首次启动率 | `firstStartRate(days, withinMinutes=5)` | 全部任务中「已开始且延迟 ≤5 分钟」的占比 |
| 首周完成率 | `week1Completion(days)` | 数据内最早 7 个自然日的任务完成占比(对照静态计划基线) |
| 启动延迟周环比 | `startDelayTrend(days)` | 每 7 天一周汇总已启动任务的平均延迟,输出每周均值、周环比变化 % 与首末周总变化 %(负值=改善) |
| 粒度自适应提升 | `adaptiveUplift(days, opts)` | 重放:从 15 分钟档出发,最近 `window=4` 个任务的期望完成率 <0.5 降一档、>0.8 升一档(2/5/10/15 相邻档位);期望值取该画像在各档位的经验完成/启动率。输出自适应 vs 固定 15 分钟基线的完成率差(百分点)与相对提升 % |

重放采用期望值法(不做二次抽样),因此 `npm run eval` 的结果完全确定、可复现。

## 消融基线(eval/run_eval.ts)

| 配置 | 规则 |
|---|---|
| 完整版 | 双画像 + 自适应粒度 + 主动督促 + 专注支持(即 `adaptiveUplift` 自适应臂) |
| 仅提醒无画像 | 固定 15 分钟档,不按画像调粒度(即固定基线臂) |
| 仅拆解无督促 | 保留自适应粒度,但无主动督促:启动率 ×0.6;因完成 ⊆ 启动且条件完成率不变,完成率同比例 ×0.6 |
| 无专注支持 | 2 分钟档不可用:`adaptiveUplift(days, { minGranularity: 5 })`,自适应下限抬高到 5 分钟 |

## 局限声明

- 数据为脚本按画像参数生成的**模拟行为数据(非真实用户)**,数值由设定驱动,仅用于验证指标口径与消融框架;
- 样本量(3 画像 × 30 天)小,不含真实干预的随机对照,不构成效果声明(诚实评测,见计划书 §12.4);
- 所有随机仅存在于 `sim:gen`(固定 seed=42);指标与消融全部为纯函数/确定性重放。
