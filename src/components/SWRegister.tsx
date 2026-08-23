"use client";
// 注册 Service Worker,并在恢复联网时触发离线发件箱重放
import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        // 注册失败不阻塞应用
      });

    const replay = () => {
      if (!navigator.onLine) return;
      navigator.serviceWorker.ready
        .then((reg) => reg.active?.postMessage("replay-outbox"))
        .catch(() => {});
    };
    window.addEventListener("online", replay);
    const t = setTimeout(replay, 2000); // 启动后也试一次(补 Background Sync 不支持的浏览器)
    return () => {
      window.removeEventListener("online", replay);
      clearTimeout(t);
    };
  }, []);
  return null;
}
