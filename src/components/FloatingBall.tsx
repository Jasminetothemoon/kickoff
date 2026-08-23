"use client";
// 悬浮对话球(右下角):点开四 Agent 对话面板 ChatBall(Coach/Spark/Pace/Mirror)
// 对外接口与旧版一致:mood 透传给 /api/chat
// 次要入口:球上方的小 chip「🟢 陪伴冲刺」→ /focus(Body Doubling 会话,不影响点球开面板的交互)
import { useState } from "react";
import Link from "next/link";
import ChatBall from "./ChatBall";

export default function FloatingBall({ mood }: { mood?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Link
        href="/focus"
        aria-label="陪伴冲刺"
        title="和 Pace 一起冲刺:一次只做一件事,他全程在场"
        style={{
          position: "fixed",
          right: "max(16px,calc(50vw - 224px))",
          bottom: 158,
          zIndex: 25,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 11px",
          borderRadius: 999,
          background: "var(--teal)",
          color: "#fff",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          textDecoration: "none",
          boxShadow: "0 6px 16px rgba(13,148,136,.35)",
        }}
      >
        🟢 陪伴冲刺
      </Link>
      <button className="fab" onClick={() => setOpen(true)} aria-label="打开学习小队对话">
        💬
        <small>小队</small>
      </button>
      <ChatBall open={open} onClose={() => setOpen(false)} mood={mood} />
    </>
  );
}
