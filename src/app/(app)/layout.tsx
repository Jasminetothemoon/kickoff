// (app) 路由组布局:四个主页面共用 AppShell 外壳
import AppShell from "@/components/AppShell";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
