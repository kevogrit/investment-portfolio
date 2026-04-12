import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadPortfolio, savePortfolio } from "@/lib/db";
import { Portfolio } from "@/lib/types";

/** Always read session; avoid any static caching of per-user JSON. */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await loadPortfolio(user.userId);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as Portfolio;
  await savePortfolio(user.userId, body);
  return NextResponse.json({ ok: true });
}
