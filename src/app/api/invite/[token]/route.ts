import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ token: string }> };

// Accept a cookbook collaboration invitation. Requires a signed-in user; the
// token is the capability, and the accepting account becomes the collaborator
// (they keep their own household).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to accept" }, { status: 401 });

  const { token } = await params;
  const invite = await prisma.cookbookInvite.findUnique({
    where: { token },
    select: { id: true, recipeBookId: true, acceptedAt: true, recipeBook: { select: { id: true, slug: true, householdId: true } } },
  });
  if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: "This invitation was already accepted" }, { status: 410 });

  // Owning the cookbook already means there's nothing to accept.
  if (invite.recipeBook.householdId === user.householdId) {
    return NextResponse.json({ error: "You already own this cookbook" }, { status: 400 });
  }

  await prisma.recipeBookCollaborator.upsert({
    where: { recipeBookId_userId: { recipeBookId: invite.recipeBookId, userId: user.userId } },
    update: {},
    create: { recipeBookId: invite.recipeBookId, userId: user.userId },
  });
  await prisma.cookbookInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

  await audit({
    category: "BOOK",
    action: "COLLABORATOR_ACCEPTED",
    summary: `${user.name} accepted a collaboration invite`,
    actorUserId: user.userId,
    actorName: user.name,
    householdId: invite.recipeBook.householdId,
    targetType: "BOOK",
    targetId: invite.recipeBookId,
  });

  return NextResponse.json({ bookId: invite.recipeBook.id, slug: invite.recipeBook.slug });
}
