import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";
import { canView } from "@/lib/workflow";

export async function GET(_: Request, ctx: RouteContext<"/api/media/[...path]">) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { path } = await ctx.params;

  const [folder] = path;
  if (folder !== "brand") {
    const order = await db.serviceOrder.findUnique({ where: { id: folder } });
    if (!order || !canView(order, user)) return new NextResponse("Not found", { status: 404 });
  }

  const file = await readStored(path);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
