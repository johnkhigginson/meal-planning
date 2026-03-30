import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";
import { createStoreSchema } from "@/lib/validators";

export async function GET() {
  const householdId = await requireHouseholdId();
  const stores = await prisma.store.findMany({
    where: { householdId },
    include: { _count: { select: { prices: true } } },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(stores);
}

export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const body = await request.json();
  const parsed = createStoreSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const store = await prisma.store.create({ data: { ...parsed.data, householdId } });
  return NextResponse.json(store, { status: 201 });
}
