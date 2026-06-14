import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHouseholdId } from "@/lib/auth";

// Members of the current household — used to populate the recipe author picker.
export async function GET() {
  const householdId = await requireHouseholdId();
  const members = await prisma.user.findMany({
    where: { householdId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(members);
}
