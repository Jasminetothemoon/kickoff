"use client";
// 「设置」:专注支持模式(localStorage 即时生效 + 后台同步到账户)+ 免打扰说明;免责声明由 AppShell 常驻展示
import { useEffect, useRef, useState } from "react";
import type { FocusSupportSettings } from "@/lib/types";
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from "@/components/data";
import { showToast } from "@/components/Toast";

export default function SettingsPage() {
  const [s, setS] = useState<FocusSupportSettings>(DEFAULT_SETTINGS);
  const [synced, setSynced] = useState(false); // PUT 成功后显示「已同步到账户」
  const touched = useRef(false); // 用户已改过则不让迟到的 GET 回填覆盖

  // 先用默认值渲染(与 SSR 一致),挂载后读本地设置,再尝试从账户回填(失败保持 localStorage 兜底)
  useEffect(() => {
    setS(loadSettings());
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { focusSupport?: Partial<FocusSupportSettings> }) => {
        const f = d?.focusSupport;
        if (!f || touched.current) return;
        const cur = loadSettings();
        const next: FocusSupportSettings = {
          enabled: typeof f.enabled === "boolean" ? f.enabled : cur.enabled,
          sprintMinutes:
            typeof f.sprintMinutes === "number" && f.sprintMinutes > 0 ? f.sprintMinutes : cur.sprintMinutes,
          singleTaskView: typeof f.singleTaskView === "boolean" ? f.singleTaskView : cur.singleTaskView,
        };
        setS(next);
        saveSettings(next); // 回填也落到本机,「今天」页等读到同一份
      })
      .catch(() => {
        // 账户不可用:localStorage 已加载,页面照常可用
      });
  }, []);

  // 改动先写本机(即时生效),同时静默 PUT 到账户;成功后右上角小字提示
  const update = (patch: Partial<FocusSupportSettings>) => {
    const next = { ...s, ...patch };
    touched.current = true;
    setS(next);
    saveSettings(next);
    setSynced(false);
    showToast("已保存到本机");
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => setSynced(true))
      .catch(() => {
        // 同步失败静默容忍:本机已生效,下次改动会再尝试
      });
  };

  return (
    <>
      <div className="hello">
        设置
        <b>让引擎适配你的大脑</b>
      </div>

      <div className="card" style={{ position: "relative" }}>
        {synced && (
          <span
            className="fade-in"
            style={{ position: "absolute", top: 18, right: 16, fontSize: 10, color: "var(--ok)" }}
          >
            已同步到账户
          </span>
        )}
        <span className="tag t-indigo">专注支持模式 · Pace</span>
        <div style={{ marginTop: 4 }}>
          <div className="setrow">
            <div>
              <b>专注支持模式</b>
              <div className="sub">短冲刺陪伴:到点就休息,不硬撑</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
                aria-label="专注支持模式"
              />
              <i />
            </label>
          </div>

          {s.enabled && (
            <div className="setrow fade-in">
              <div>
                <b>冲刺时长</b>
                <div className="sub">默认 10 分钟,到点提醒休息</div>
              </div>
              <div className="seg">
                {[10, 15].map((m) => (
                  <button
                    key={m}
                    className={s.sprintMinutes === m ? "on" : ""}
                    onClick={() => update({ sprintMinutes: m })}
                  >
                    {m} 分钟
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="setrow">
            <div>
              <b>单任务视图</b>
              <div className="sub">「今天」页只显示当前任务,减少分心</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={s.singleTaskView}
                onChange={(e) => update({ singleTaskView: e.target.checked })}
                aria-label="单任务视图"
              />
              <i />
            </label>
          </div>
        </div>
        <div className="sub mt10">
          当前冲刺时长({s.sprintMinutes} 分钟)会同步到「今天」页的倒计时选项(2 分钟微启动 / 10 / 15 分钟可选)
        </div>
      </div>

      <div className="card">
        <span className="tag t-teal">设备配对 · 桌面伴侣/小程序</span>
        <h3 style={{ margin: "10px 0 6px" }}>你的配对码</h3>
        <div className="sub">在 Mac 桌面伴侣(菜单栏 → 设置)或微信小程序「我的」页粘贴此码,即可让该设备与当前网页账户同步数据。</div>
        <div
          className="intent"
          style={{ marginTop: 10, fontFamily: "Menlo, monospace", fontSize: 11.5, wordBreak: "break-all", cursor: "pointer" }}
          onClick={(e) => {
            const code = (e.currentTarget.querySelector("span")?.textContent || "").trim();
            if (code) {
              navigator.clipboard?.writeText(code).catch(() => {});
              (e.currentTarget.querySelector("small") as HTMLElement | null)?.remove();
              const tag = document.createElement("small");
              tag.textContent = " ✓ 已复制";
              e.currentTarget.appendChild(tag);
            }
          }}
        >
          <span>{typeof window !== "undefined" ? (document.cookie.match(/kickoff_uid=([^;]+)/)?.[1] ?? "未获取到(刷新重试)") : ""}</span>
        </div>
      </div>

<div className="card">
        <span className="tag t-orange">主动邀约 · Pace 会来找你</span>
        <h3 style={{ margin: "10px 0 6px" }}>浏览器通知</h3>
        <div className="sub">在你不打开 App 的时候,活跃时段的「启动邀约」也能到达(2 分钟第一步,直达计时器)。可随时关闭。</div>
        <button
          className="btn btn-main"
          style={{ marginTop: 10 }}
          id="enable-push-btn"
          onClick={async (e) => {
            const btn = e.currentTarget;
            try {
              if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
                btn.textContent = "此浏览器不支持推送";
                return;
              }
              const perm = await Notification.requestPermission();
              if (perm !== "granted") { btn.textContent = "已拒绝 — 可在浏览器设置中重新允许"; return; }
              const keyRes = await fetch("/api/push/key").then((r) => r.json());
              if (!keyRes?.publicKey) { btn.textContent = "服务器未配置 VAPID"; return; }
              const reg = await navigator.serviceWorker.ready;
              const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: Uint8Array.from(atob(keyRes.publicKey), (c) => c.charCodeAt(0)),
              });
              const j = sub.toJSON();
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }),
              });
              btn.textContent = "✓ 已开启 — 到点 Pace 会来敲门";
              const testBtn = document.createElement("button");
              testBtn.className = "btn btn-ghost";
              testBtn.style.marginTop = "8px";
              testBtn.textContent = "🔔 发送一条测试邀约(现在)";
              testBtn.onclick = async () => {
                testBtn.textContent = "发送中…";
                try {
                  const r = await fetch("/api/push/invite", { method: "POST" }).then((x) => x.json());
                  testBtn.textContent = r?.sent > 0 ? "✓ 已发出 — 看一眼通知中心/锁屏" : "未发出:" + (r?.reason || "没有有效订阅");
                } catch {
                  testBtn.textContent = "发送失败(稍后再试)";
                }
              };
              btn.after(testBtn);
            } catch {
              btn.textContent = "开启失败(需 HTTPS 或 localhost 环境)";
            }
          }}
        >
          开启主动邀约通知
        </button>
      </div>

<div className="card">
        <span className="tag t-teal">免打扰 · 无羞耻设计</span>
        <h3 style={{ marginTop: 6 }}>不打扰,是一种功能</h3>
        <div className="sub mt6">Kickoff 不做推送、不做红点轰炸:所有提示只在你主动打开时出现。</div>
        <div className="sub mt6">22:30 后进入免打扰时段,不再展示激励信息,只保留一句「今天已经够了」。</div>
        <div className="sub mt6">中断不追责:断签不是失败,是数据 — 随时可以从第一步重新开始(无惩罚)。</div>
      </div>

      <div className="card">
        <span className="tag t-amber">数据与隐私</span>
        <h3 style={{ marginTop: 6 }}>先存本机,联网再同步</h3>
        <div className="sub mt6">
          以上偏好先保存在本设备浏览器(localStorage 键:{SETTINGS_KEY}),离线也即时生效;联网时会同步到你的账户,同步失败不影响本机使用。画像数据的导出与删除在「画像」页底部。
        </div>
      </div>
    </>
  );
}
