"use client";
// 四个 Agent 的可爱动态形象(纯 inline SVG,不引外部资源;keyframes 全部 kickoff- 前缀,组件内注入)
// 统一设计语言:圆滚滚 blob 身体 + 简单眼睛 + 各一个标志物与专属色,线条圆润、SVG 手绘感
//   Coach  靛蓝 #4F46E5 戴小圆眼镜的猫头鹰(智慧/规划)— kickoff-float 4s 缓慢上下浮动
//   Spark  暖橙 #E8701A 带小火苗的小火箭精灵 — kickoff-bounce 2.5s 轻快弹跳 + kickoff-flicker 火苗摇曳
//   Pace   青色 #0D9488 呼吸起伏的圆润水滴(冥想感,闭眼 + 小圆嘴)— kickoff-breath 4s 呼-吸节律
//   Mirror 琥珀 #C7840A 持小镜子的星星精灵 — kickoff-blink 偶尔眨眼 + kickoff-sparkle 镜面闪光
// prefers-reduced-motion 时全部静止(媒体查询兜底)

export type AvatarAgent = "Coach" | "Spark" | "Pace" | "Mirror";

/** 动画样式:keyframes + 类,统一在此定义;reduced-motion 下一律 animation:none */
const AVATAR_STYLE = `
@keyframes kickoff-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.6px); } }
@keyframes kickoff-bounce { 0%,100% { transform: translateY(0); } 45% { transform: translateY(-3.4px); } 62% { transform: translateY(0.6px); } }
@keyframes kickoff-flicker { 0%,100% { transform: scale(1,1); } 40% { transform: scale(0.92,1.25); } 70% { transform: scale(1.05,0.9); } }
@keyframes kickoff-breath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.07); } }
@keyframes kickoff-blink { 0%,90%,100% { transform: scaleY(1); } 94% { transform: scaleY(0.08); } 97% { transform: scaleY(1); } }
@keyframes kickoff-sparkle {
  0%,62%,100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
  72% { opacity: 1; transform: scale(1) rotate(20deg); }
  86% { opacity: 0; transform: scale(0.5) rotate(36deg); }
}
.kickoff-float { animation: kickoff-float 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.kickoff-bounce { animation: kickoff-bounce 2.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.kickoff-flicker { animation: kickoff-flicker 0.9s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 0%; }
.kickoff-breath { animation: kickoff-breath 4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.kickoff-blink { animation: kickoff-blink 4.8s linear infinite; transform-box: fill-box; transform-origin: center; }
.kickoff-sparkle { animation: kickoff-sparkle 5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .kickoff-float,.kickoff-bounce,.kickoff-flicker,.kickoff-breath,.kickoff-blink,.kickoff-sparkle { animation: none !important; }
  .kickoff-sparkle { opacity: 1; }
}
`;

interface ShapeProps {
  animate: boolean;
}

/** Coach:小圆眼镜猫头鹰(靛蓝)— 整体缓慢浮动 */
function CoachOwl({ animate }: ShapeProps) {
  return (
    <g className={animate ? "kickoff-float" : undefined}>
      {/* 耳簇 */}
      <path d="M13.5 15 Q10.5 7 18 9.6 Q16.4 12.8 15.6 15.8 Z" fill="#4338CA" />
      <path d="M34.5 15 Q37.5 7 30 9.6 Q31.6 12.8 32.4 15.8 Z" fill="#4338CA" />
      {/* 小翅膀 */}
      <path d="M9.2 24.5 C5.8 25.8 4.2 29.6 5 33 C7.5 31.7 9.3 30 10 27.9 Z" fill="#4338CA" />
      <path d="M38.8 24.5 C42.2 25.8 43.8 29.6 43 33 C40.5 31.7 38.7 30 38 27.9 Z" fill="#4338CA" />
      {/* 圆滚滚身体 */}
      <path
        d="M24 8.5 C32.8 8.5 39.5 16 39.5 26.5 C39.5 35.8 32.6 41.5 24 41.5 C15.4 41.5 8.5 35.8 8.5 26.5 C8.5 16 15.2 8.5 24 8.5 Z"
        fill="#4F46E5"
      />
      {/* 肚皮 */}
      <ellipse cx="24" cy="31.8" rx="10.2" ry="7.6" fill="#E0E7FF" />
      {/* 头顶高光 */}
      <circle cx="15.8" cy="13.8" r="1.5" fill="#A5B4FC" />
      {/* 小嘴(先画,让镜片压住一点) */}
      <path d="M24 26.4 L26.5 28.8 Q24 31 21.5 28.8 Z" fill="#FBBF24" />
      {/* 小圆眼镜:双镜片 + 鼻梁 + 镜腿 */}
      <circle cx="18" cy="21.5" r="5" fill="#FDFEFF" stroke="#312E81" strokeWidth="2" />
      <circle cx="30" cy="21.5" r="5" fill="#FDFEFF" stroke="#312E81" strokeWidth="2" />
      <path d="M23 21.4 Q24 20.2 25 21.4" fill="none" stroke="#312E81" strokeWidth="2" strokeLinecap="round" />
      <path d="M13.2 20.7 Q11.2 20.1 10.2 18.6" fill="none" stroke="#312E81" strokeWidth="2" strokeLinecap="round" />
      <path d="M34.8 20.7 Q36.8 20.1 37.8 18.6" fill="none" stroke="#312E81" strokeWidth="2" strokeLinecap="round" />
      {/* 简单眼睛 */}
      <circle cx="18" cy="22" r="1.8" fill="#312E81" />
      <circle cx="30" cy="22" r="1.8" fill="#312E81" />
    </g>
  );
}

/** Spark:小火苗火箭精灵(暖橙)— 弹跳 + 尾焰摇曳 */
function SparkRocket({ animate }: ShapeProps) {
  return (
    <g className={animate ? "kickoff-bounce" : undefined}>
      {/* 尾焰(嵌套在弹跳组里,跟着火箭一起跳,自身摇曳) */}
      <g className={animate ? "kickoff-flicker" : undefined}>
        <path d="M24 33.2 C28.2 36.8 28.6 41 24 45.4 C19.4 41 19.8 36.8 24 33.2 Z" fill="#FDBA74" />
        <path d="M24 35.8 C26.3 38 26.5 40.4 24 42.9 C21.5 40.4 21.7 38 24 35.8 Z" fill="#FDE68A" />
      </g>
      {/* 侧鳍 */}
      <path d="M14.8 26.2 C10.8 27.6 8.8 31.6 9.2 35.4 C12.4 34 14.5 31.8 15.4 29.4 Z" fill="#C2570C" />
      <path d="M33.2 26.2 C37.2 27.6 39.2 31.6 38.8 35.4 C35.6 34 33.5 31.8 32.6 29.4 Z" fill="#C2570C" />
      {/* 圆滚滚火箭身(blob) */}
      <path
        d="M24 3.5 C30.6 8 33.8 15 33.8 22.5 L33.8 29 C33.8 32.4 30.9 34.5 24 34.5 C17.1 34.5 14.2 32.4 14.2 29 L14.2 22.5 C14.2 15 17.4 8 24 3.5 Z"
        fill="#E8701A"
      />
      {/* 浅色鼻锥 */}
      <path
        d="M24 3.5 C27.9 6.5 30.5 10.6 32 15.2 C29.5 13.9 26.8 13.2 24 13.2 C21.2 13.2 18.5 13.9 16 15.2 C17.5 10.6 20.1 6.5 24 3.5 Z"
        fill="#F9A45A"
      />
      {/* 简单眼睛 + 微笑 */}
      <circle cx="20.4" cy="20.6" r="1.8" fill="#7C2D12" />
      <circle cx="27.6" cy="20.6" r="1.8" fill="#7C2D12" />
      <path d="M22 23.8 Q24 25.6 26 23.8" fill="none" stroke="#7C2D12" strokeWidth="1.8" strokeLinecap="round" />
      {/* 腮红 */}
      <circle cx="17.6" cy="23.2" r="1.4" fill="#FDBA74" />
      <circle cx="30.4" cy="23.2" r="1.4" fill="#FDBA74" />
    </g>
  );
}

/** Pace:呼吸水滴(青)— 闭眼冥想,整体呼-吸缩放 */
function PaceDrop({ animate }: ShapeProps) {
  return (
    <g className={animate ? "kickoff-breath" : undefined}>
      {/* 圆润水滴身体 */}
      <path
        d="M24 5.5 C24 5.5 36.5 20.5 36.5 29.5 C36.5 37 31 42.5 24 42.5 C17 42.5 11.5 37 11.5 29.5 C11.5 20.5 24 5.5 24 5.5 Z"
        fill="#0D9488"
      />
      {/* 高光 */}
      <ellipse cx="19.2" cy="15.2" rx="2.1" ry="4" fill="#5EEAD4" opacity="0.55" transform="rotate(16 19.2 15.2)" />
      {/* 简单闭眼(冥情感) */}
      <path d="M18.5 27.4 Q20.6 30 22.7 27.4" fill="none" stroke="#E7FBF6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M25.3 27.4 Q27.4 30 29.5 27.4" fill="none" stroke="#E7FBF6" strokeWidth="2.2" strokeLinecap="round" />
      {/* 小圆嘴(配合呼吸的"呼—"感) */}
      <circle cx="24" cy="32.6" r="1.4" fill="#E7FBF6" />
      {/* 腮红 */}
      <circle cx="15.6" cy="30.6" r="1.8" fill="#5EEAD4" opacity="0.6" />
      <circle cx="32.4" cy="30.6" r="1.8" fill="#5EEAD4" opacity="0.6" />
    </g>
  );
}

/** Mirror:持小镜子的星星精灵(琥珀)— 偶尔眨眼 + 镜面闪光 */
function MirrorStar({ animate }: ShapeProps) {
  return (
    <>
      {/* 镜柄(从星星身后伸出) */}
      <path d="M28.5 33.5 L35 34.8" stroke="#92400E" strokeWidth="2.6" strokeLinecap="round" />
      {/* 小镜子:镜面 + 白色反光弧 */}
      <circle cx="40" cy="34" r="5.2" fill="#FDE68A" stroke="#92400E" strokeWidth="2.2" />
      <path
        d="M37.2 32.4 Q38.8 31.3 40.6 31.6"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* 圆角星星身体(粗同色描边 + round join 做圆角,手绘感) */}
      <path
        d="M20 10 L23.88 19.66 L34.27 20.37 L26.28 27.04 L28.82 37.14 L20 31.6 L11.18 37.14 L13.72 27.04 L5.73 20.37 L16.12 19.66 Z"
        fill="#C7840A"
        stroke="#C7840A"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* 简单眼睛(偶尔眨) */}
      <g className={animate ? "kickoff-blink" : undefined}>
        <circle cx="16.4" cy="23.4" r="1.7" fill="#451A03" />
        <circle cx="23.6" cy="23.4" r="1.7" fill="#451A03" />
      </g>
      {/* 微笑 */}
      <path d="M17.7 27 Q20 29.2 22.3 27" fill="none" stroke="#451A03" strokeWidth="1.7" strokeLinecap="round" />
      {/* 腮红 */}
      <circle cx="13.4" cy="26.2" r="1.4" fill="#FDE68A" opacity="0.8" />
      <circle cx="26.6" cy="26.2" r="1.4" fill="#FDE68A" opacity="0.8" />
      {/* 镜面闪光(偶尔亮一下) */}
      <g className={animate ? "kickoff-sparkle" : undefined}>
        <path
          d="M43.6 19.4 L44.7 22.1 L47.4 23.2 L44.7 24.3 L43.6 27 L42.5 24.3 L39.8 23.2 L42.5 22.1 Z"
          fill="#FFFFFF"
        />
      </g>
    </>
  );
}

export default function AgentAvatar({
  agent,
  size = 36,
  animate = true,
  className,
}: {
  agent: AvatarAgent;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        flex: "none",
        verticalAlign: "middle",
        pointerEvents: "none",
      }}
    >
      <style>{AVATAR_STYLE}</style>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        {agent === "Coach" && <CoachOwl animate={animate} />}
        {agent === "Spark" && <SparkRocket animate={animate} />}
        {agent === "Pace" && <PaceDrop animate={animate} />}
        {agent === "Mirror" && <MirrorStar animate={animate} />}
      </svg>
    </span>
  );
}
