"use client";
// 应用外壳:顶部轻量页头 + 底部 TabBar(当前路由高亮)+ 常驻免责声明 + 全局 Toast
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ToastHost } from "./Toast";

const TABS = [
  { href: "/today", label: "今天", icon: "⚡" },
  { href: "/plan", label: "计划", icon: "📋" },
  { href: "/profile", label: "画像", icon: "🪞" },
  { href: "/settings", label: "设置", icon: "⚙️" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <>
      <header className="appbar">
        <span className="logo">⚡</span>
        <div>
          <b>Kickoff</b>
          <small>启学引擎 · 把「想学」变成「在学」</small>
        </div>
        <Link
          href="/guide"
          aria-label="使用教程:如何接入任何技能与资源"
          title="怎么接入我的技能和资源?3 分钟教程"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "5px 12px",
            borderRadius: 999,
            background: "var(--indigo-l)",
            color: "var(--indigo)",
            fontSize: 11.5,
            fontWeight: 600,
            textDecoration: "none",
            flex: "none",
          }}
        >
          📖 怎么接入
        </Link>
      </header>

      <main className="page">{children}</main>

      <p className="disclaimer">Kickoff 是学习与自我管理工具,不构成医疗建议或诊断,不替代专业治疗。</p>

      <nav className="tabbar" aria-label="主导航">
        {TABS.map((t) => {
          const on = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} className={"tab" + (on ? " on" : "")} aria-current={on ? "page" : undefined}>
              <span className="ic" aria-hidden="true">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>

      <ToastHost />
    </>
  );
}
