import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; entryId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { entryId } = await params;
  await prisma.mealPlanEntry.delete({
    where: { id: parseInt(entryId, 10) },
  });
  return NextResponse.json({ success: true });
}
