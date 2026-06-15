import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

async function ensureAdmin(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
}

export async function GET() {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const stores = await prisma.libraryStore.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(stores);
}

export async function POST(request: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const body = await request.json();

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Upsert by unique name so a duplicate returns the existing row, not a 500.
  const store = await prisma.libraryStore.upsert({
    where: { name: body.name.trim() },
    update: {},
    create: { name: body.name.trim() },
  });
  return NextResponse.json(store, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  await prisma.libraryStore.deleteMany({ where: { id } });
  return NextResponse.json({ success: true });
}
