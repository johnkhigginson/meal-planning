import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessBook } from "@/lib/collab";
import { normalizeEmail } from "@/lib/email-normalize";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

// Owner check: the cookbook belongs to the caller's household.
async function ownsBook(bookId: number, householdId: number) {
  if (Number.isNaN(bookId)) return false;
  return !!(await prisma.recipeBook.findFirst({ where: { id: bookId, householdId }, select: { id: true } }));
}

// List collaborators — visible to the owning household and to collaborators.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (Number.isNaN(bookId) || !(await canAccessBook(bookId, user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const collaborators = await prisma.recipeBookCollaborator.findMany({
    where: { recipeBookId: bookId },
    select: { user: { select: { id: true, name: true, email: true } }, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(collaborators.map((c) => ({ ...c.user, since: c.createdAt })));
}

// Add a collaborator by email (owner only). The person must already have an
// account; they keep their own household.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (!(await ownsBook(bookId, user.householdId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email: rawEmail } = await request.json();
  if (!rawEmail || typeof rawEmail !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const email = normalizeEmail(rawEmail);

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, householdId: true } });
  if (!target) {
    return NextResponse.json({ error: "No account found for that email. Ask them to sign up first." }, { status: 404 });
  }
  if (target.householdId === user.householdId) {
    return NextResponse.json({ error: "They're already in your household." }, { status: 409 });
  }

  await prisma.recipeBookCollaborator.upsert({
    where: { recipeBookId_userId: { recipeBookId: bookId, userId: target.id } },
    update: {},
    create: { recipeBookId: bookId, userId: target.id },
  });

  await audit({
    category: "BOOK",
    action: "COLLABORATOR_ADDED",
    summary: `${user.name} added ${target.name} as a collaborator`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId: user.householdId,
    targetType: "BOOK",
    targetId: bookId,
    metadata: { collaboratorId: target.id },
  });

  return NextResponse.json({ id: target.id, name: target.name, email: target.email }, { status: 201 });
}

// Remove a collaborator (owner only).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (!(await ownsBook(bookId, user.householdId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = parseInt(new URL(request.url).searchParams.get("userId") || "0", 10);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.recipeBookCollaborator.deleteMany({ where: { recipeBookId: bookId, userId } });
  return NextResponse.json({ success: true });
}
