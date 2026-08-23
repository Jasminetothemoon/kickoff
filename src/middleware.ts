// 多用户底座:为每个访问者发放匿名 uid cookie(免注册 MVP);
// 微信小程序等无 Cookie 客户端可通过 x-kickoff-uid 请求头自带 uid。
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const headerUid = request.headers.get("x-kickoff-uid");
  const existing = request.cookies.get("kickoff_uid")?.value;
  const uid = existing || headerUid || crypto.randomUUID();
  if (!existing) {
    // 首次访问:把 uid 同时写入请求对象,保证本次 route handler 即可读到(否则回退共享 demo)
    request.cookies.set("kickoff_uid", uid);
  }
  const res = NextResponse.next({ request });
  if (!existing || (headerUid && headerUid !== existing)) {
    res.cookies.set("kickoff_uid", uid, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|icons).*)"],
};
