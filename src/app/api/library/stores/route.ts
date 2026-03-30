import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

export async function GET() {
  await requireHouseholdId();
  const stores = await prisma.libraryStore.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(stores);
}

// Import a library store into the user's household
export async function POST(request: NextRequest) {
  const householdId = await requireHouseholdId();
  const { libraryStoreId } = await request.json();

  const libStore = await prisma.libraryStore.findUnique({
    where: { id: libraryStoreId },
  });

  if (!libStore) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Check if already added
  const existing = await prisma.store.findFirst({
    where: { householdId, name: libStore.name },
  });
  if (existing) {
    return NextResponse.json({ error: "Store already in your list" }, { status: 409 });
  }

  const store = await prisma.store.create({
    data: { householdId, name: libStore.name },
  });

  return NextResponse.json(store, { status: 201 });
}
