"use client";
// 注册 Service Worker + 联网时重放离线队列
import { useEffect } from "react";
import { replayOutbox } from "@/lib/offline";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    replayOutbox();
    const onOnline = () => {
      replayOutbox().then((n) => {
        if (n > 0 && process.env.NODE_ENV !== "production") console.log(`[kickoff] 离线队列已同步 ${n} 条`);
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
