// 离线外发队列:打卡/停车场在断网时先落本地,联网自动重放(弱网可用的关键)
const KEY = "kickoff.outbox";
const ALLOWED = ["/api/checkins", "/api/park"];

interface OutboxItem { url: string; body: unknown; ts: number }

function read(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as OutboxItem[]; } catch { return []; }
}
function write(items: OutboxItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(-50)));
}

export function canQueue(url: string): boolean {
  return ALLOWED.includes(url);
}

export function enqueue(url: string, body: unknown) {
  write([...read(), { url, body, ts: Date.now() }]);
}

export async function replayOutbox(): Promise<number> {
  const items = read();
  if (items.length === 0) return 0;
  const remain: OutboxItem[] = [];
  let sent = 0;
  for (const it of items) {
    try {
      const res = await fetch(it.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(it.body),
      });
      if (res.ok) sent += 1; else remain.push(it);
    } catch {
      remain.push(it);
    }
  }
  write(remain);
  return sent;
}
