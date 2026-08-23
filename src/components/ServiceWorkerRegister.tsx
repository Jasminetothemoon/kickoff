"use client";
// 注册 Service Worker(生产环境;开发环境跳过避免缓存干扰热更)
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败静默:不影响主流程
    });
  }, []);
  return null;
}
