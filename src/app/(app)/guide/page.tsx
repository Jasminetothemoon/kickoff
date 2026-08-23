import Link from "next/link";
// 「怎么接入」教程页:三步把任何技能 + 你手里的资源带进 Kickoff
const RES_TYPES = [
  {
    icon: "🔗",
    name: "视频 / 教程链接",
    how: "链接 + 空格 + 一句备注(备注会变成任务名)",
    example: "https://www.bilibili.com/video/BV1xx 吉他零基础入门教程",
    becomes: "挂在对应任务上,计划里出现可点击的 📎 入口,点开直达",
    color: "var(--teal)",
    bg: "var(--teal-l)",
  },
  {
    icon: "📚",
    name: "书籍 / 教材",
    how: "书名 + 你打算读的范围",
    example: "《吉他三月通》教材前 3 章",
    becomes: "拆成阅读任务,按页数/章节排进周计划,粒度从 5 分钟起步",
    color: "var(--indigo)",
    bg: "var(--indigo-l)",
  },
  {
    icon: "🌏",
    name: "线下要点 / 动手练习",
    how: "直接写清楚做什么、多久一次",
    example: "每周六去琴行摸真琴 30 分钟",
    becomes: "变成动手练习型任务 —— 乐器/运动/手工等物理技能以这类为主",
    color: "var(--orange)",
    bg: "var(--orange-l)",
  },
];

export default function GuidePage() {
  return (
    <>
      <div className="hello">
        使用教程 · 3 分钟学会
        <b>把任何技能带进 Kickoff</b>
      </div>

      {/* 第 1 步 */}
      <div className="card" style={{ borderLeft: "4px solid var(--indigo)" }}>
        <span className="tag t-indigo">第 1 步 · 写下你的目标</span>
        <h3 style={{ margin: "10px 0 6px" }}>一句话,具体到能想象出画面</h3>
        <div className="sub" style={{ lineHeight: 1.8 }}>
          ✅ 好目标:「三个月学会 Python 数据分析」「两个月用吉他弹唱一首歌」
          <br />
          ⚠️ 太模糊:「学编程」「提升自己」—— Coach 也能处理,但路线会更通用
        </div>
        <div className="sub mt6">
          入口:「今天」页顶部 →「生成我的学习计划」;已有目标想换新技能时,直接再建一个新目标即可切换。
        </div>
      </div>

      {/* 第 2 步:三类资源 */}
      <div className="hello" style={{ marginTop: 4 }}>
        第 2 步 · 贴上你的资源(可选,但强烈推荐)
        <b>三类资源,每行一条,随便混搭</b>
      </div>

      {RES_TYPES.map((t) => (
        <div key={t.name} className="card">
          <div className="row">
            <span
              className="tag"
              style={{ background: t.bg, color: t.color, fontSize: 13, padding: "6px 12px" }}
            >
              {t.icon} {t.name}
            </span>
          </div>
          <div className="sub mt6">怎么写:{t.how}</div>
          <div
            className="intent"
            style={{ marginTop: 8, fontFamily: "Menlo, monospace", fontSize: 11.5, wordBreak: "break-all" }}
          >
            {t.example}
          </div>
          <div className="sub mt6">
            会变成:{t.becomes}
          </div>
        </div>
      ))}

      <div className="card" style={{ borderLeft: "4px solid var(--orange)" }}>
        <span className="tag t-orange">贴资源的位置</span>
        <div className="sub mt6" style={{ lineHeight: 1.8 }}>
          目标向导里的「我的资源(可选 · 任意技能)」输入框 —— 每行一条,最多 12 条。
          <br />
          视频教程、公众号文章、网课链接、书、线下安排……全部可以放进同一次创建里,Coach 会自动识别类型并编排。
        </div>
      </div>

      {/* 第 3 步 */}
      <div className="card" style={{ borderLeft: "4px solid var(--teal)" }}>
        <span className="tag t-teal">第 3 步 · 生成后怎么用</span>
        <ul className="steps" style={{ background: "transparent", border: "none", padding: 0 }}>
          <li><span className="dot" style={{ background: "var(--teal-l)", color: "var(--teal)" }}>1</span>首周自动压载:每天最多 1-2 个任务、粒度 2-5 分钟 —— 先建立「每天都开始」,再谈强度</li>
          <li><span className="dot" style={{ background: "var(--teal-l)", color: "var(--teal)" }}>2</span>今天页:只看第一张启动卡;觉得难就点「换更小的步骤」,可无限降档</li>
          <li><span className="dot" style={{ background: "var(--teal-l)", color: "var(--teal)" }}>3</span>带 📎 的任务:点资源条直达视频/教程,看完回来打卡</li>
          <li><span className="dot" style={{ background: "var(--teal-l)", color: "var(--teal)" }}>4</span>打卡几次后:画像页会长出你的卡点分布与粒度矩阵,低谷日自动减载</li>
          <li><span className="dot" style={{ background: "var(--teal-l)", color: "var(--teal)" }}>5</span>右下角「小队」:随时喊 Spark 拆任务、Mirror 复盘、Pace 打气</li>
        </ul>
      </div>

      {/* FAQ */}
      <div className="card">
        <span className="tag t-amber">常见问题</span>
        <div className="sub mt6" style={{ lineHeight: 1.9 }}>
          <b>找不到创建入口?</b>入口在「今天」页 —— 没有目标时是顶部大卡片;已有目标时从页头菜单新建。
          <br />
          <b>已有目标,想给现在学的技能加资源?</b>当前版本通过新建目标携带资源(旧目标会保留);「追加资源到现有目标」在路线图中。
          <br />
          <b>不填资源行不行?</b>完全可以 —— 系统会按目标生成通用微启动路线;内置了 Python 数据分析与英语四级的精细路线,其余技能建议带上你的资源,路线会更贴合。
          <br />
          <b>资源链接会被抓取或存储到别处吗?</b>不会,仅原样保存并在任务上展示跳转(见「设置-数据与隐私」与数据合规说明)。
        </div>
      </div>

      <Link href="/today" className="btn btn-main" style={{ textAlign: "center", textDecoration: "none" }}>
        去创建我的目标 →
      </Link>
      <div className="sub center">有问题随时问右下角「小队」:比如「我想学 X,该怎么开始?」</div>
    </>
  );
}
