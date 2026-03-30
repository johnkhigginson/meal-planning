import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const units = await prisma.unit.findMany({
    orderBy: [{ unitType: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(units);
}
