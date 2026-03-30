import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTagSchema } from "@/lib/validators";

export async function GET() {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tag = await prisma.tag.create({ data: parsed.data });
  return NextResponse.json(tag, { status: 201 });
}
