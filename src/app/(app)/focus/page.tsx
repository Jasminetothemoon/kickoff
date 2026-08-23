// 陪伴冲刺(Body Doubling):Pace 全程在场的单任务冲刺会话 — /focus
// 外壳由 (app) 路由组提供(页头/TabBar/免责声明);页面本身为三阶段单页流
import FocusSession from "@/components/FocusSession";

export const metadata = { title: "陪伴冲刺 · Kickoff" };

export default function FocusPage() {
  return <FocusSession />;
}
