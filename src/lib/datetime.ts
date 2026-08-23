// 日期工具:全程使用本地时区,契约中 date 一律 YYYY-MM-DD
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): string {
  return fmtDate(new Date());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** 从 from 到 to 经过的整天数(不足一天向下取整,负数归零) */
export function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86400000);
}
