import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { createImpersonationToken } from "@/lib/impersonation";
import { audit, clientIp } from "@/lib/audit";

// Mint a short-lived impersonation token for the target user. Admin-only — this
// gate is what makes the impersonate credentials provider safe to trust.
export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { userId } = await request.json();
  if (typeof userId !== "number") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (userId === admin.userId) {
    return NextResponse.json({ error: "You are already signed in as this user" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await audit({
    category: "ADMIN",
    action: "IMPERSONATE_START",
    summary: `${admin.name} started impersonating ${target.name}`,
    actorUserId: admin.userId,
    actorName: admin.name,
    targetType: "USER",
    targetId: target.id,
    ip: clientIp(request),
  });

  const token = createImpersonationToken(target.id, admin.userId);
  return NextResponse.json({ token, name: target.name });
}
