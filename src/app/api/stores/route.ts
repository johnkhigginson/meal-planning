import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { createStoreSchema } from "@/lib/validators";

export async function GET() {
  const userId = await requireUserId();
  const stores = await prisma.store.findMany({
    where: { userId },
    include: { _count: { select: { prices: true } } },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(stores);
}

export async function POST(request: NextRequest) {
  const userId = await requireUserId();
  const body = await request.json();
  const parsed = createStoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const store = await prisma.store.create({
    data: { ...parsed.data, userId },
  });
  return NextResponse.json(store, { status: 201 });
}
