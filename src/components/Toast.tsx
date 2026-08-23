"use client";
// 轻量全局 toast:任意组件调 showToast(msg),由 AppShell 挂载的 ToastHost 统一展示
import { useEffect, useState } from "react";

const TOAST_EVENT = "kickoff:toast";

export function showToast(msg: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: msg }));
  }
}

export function ToastHost() {
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMsg(""), 2600);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <div className={"toast" + (msg ? " show" : "")}>{msg}</div>;
}
