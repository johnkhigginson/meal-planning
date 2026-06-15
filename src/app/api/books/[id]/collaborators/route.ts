import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAccessBook } from "@/lib/collab";
import { normalizeEmail } from "@/lib/email-normalize";
import { sendCookbookInviteEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site";
import { audit } from "@/lib/audit";

type RouteParams = { params: Promise<{ id: string }> };

// Owner check: the cookbook belongs to the caller's household. Returns the book
// (with its name) so callers can build invite emails.
async function ownedBook(bookId: number, householdId: number) {
  if (Number.isNaN(bookId)) return null;
  return prisma.recipeBook.findFirst({ where: { id: bookId, householdId }, select: { id: true, name: true } });
}

// List collaborators and any pending email invitations — visible to the owning
// household and to collaborators.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (Number.isNaN(bookId) || !(await canAccessBook(bookId, user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [collaborators, invites] = await Promise.all([
    prisma.recipeBookCollaborator.findMany({
      where: { recipeBookId: bookId },
      select: { user: { select: { id: true, name: true, email: true } }, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cookbookInvite.findMany({
      where: { recipeBookId: bookId, acceptedAt: null },
      select: { email: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return NextResponse.json({
    collaborators: collaborators.map((c) => ({ ...c.user, since: c.createdAt })),
    invites: invites.map((i) => ({ email: i.email, since: i.createdAt })),
  });
}

// Add a collaborator by email (owner only). If they already have an account
// they're added immediately; otherwise we email them an invitation to create an
// account and accept. Collaborators keep their own household either way.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  const book = await ownedBook(bookId, user.householdId);
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email: rawEmail } = await request.json();
  if (!rawEmail || typeof rawEmail !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const email = normalizeEmail(rawEmail);

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, householdId: true } });

  // No account yet → create/refresh a pending invite and email them.
  if (!target) {
    const existing = await prisma.cookbookInvite.findUnique({
      where: { recipeBookId_email: { recipeBookId: bookId, email } },
      select: { token: true },
    });
    const token = existing?.token ?? randomBytes(24).toString("hex");
    await prisma.cookbookInvite.upsert({
      where: { recipeBookId_email: { recipeBookId: bookId, email } },
      update: { acceptedAt: null, invitedByName: user.name, token },
      create: { recipeBookId: bookId, email, token, invitedByName: user.name },
    });

    try {
      await sendCookbookInviteEmail({
        toEmail: email,
        inviterName: user.name,
        bookName: book.name,
        acceptUrl: `${getSiteUrl()}/invite/${token}`,
      });
    } catch (e) {
      console.error("cookbook invite email failed", e);
      return NextResponse.json({ error: "Could not send the invitation email." }, { status: 502 });
    }

    await audit({
      category: "BOOK",
      action: "COLLABORATOR_INVITED",
      summary: `${user.name} invited ${email} to collaborate on “${book.name}”`,
      actorUserId: user.userId,
      actorName: user.name,
      householdId: user.householdId,
      targetType: "BOOK",
      targetId: bookId,
      metadata: { email },
    });

    return NextResponse.json({ invited: true, email }, { status: 200 });
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

// Remove a collaborator by userId, or revoke a pending invite by email (owner only).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requireUser();
  const bookId = parseInt((await params).id, 10);
  if (!(await ownedBook(bookId, user.householdId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get("userId") || "0", 10);
  const inviteEmail = url.searchParams.get("email");

  if (userId) {
    await prisma.recipeBookCollaborator.deleteMany({ where: { recipeBookId: bookId, userId } });
  } else if (inviteEmail) {
    await prisma.cookbookInvite.deleteMany({ where: { recipeBookId: bookId, email: normalizeEmail(inviteEmail) } });
  } else {
    return NextResponse.json({ error: "userId or email required" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
