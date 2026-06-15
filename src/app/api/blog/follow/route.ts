import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Follow state for a published cookbook. Lives under /api/blog/ so the GET works
// for logged-out visitors (returns following:false); following itself requires
// a signed-in user, which is what nudges visitors to sign in.

function parseBookId(request: NextRequest): number | null {
  const id = parseInt(new URL(request.url).searchParams.get("bookId") || "", 10);
  return Number.isNaN(id) ? null : id;
}

async function publishedBook(bookId: number) {
  return prisma.recipeBook.findFirst({ where: { id: bookId, isPublished: true }, select: { id: true } });
}

export async function GET(request: NextRequest) {
  const bookId = parseBookId(request);
  if (bookId == null) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });

  const user = await getCurrentUser();
  const [count, mine] = await Promise.all([
    prisma.blogSubscriber.count({ where: { recipeBookId: bookId } }),
    user
      ? prisma.blogSubscriber.findUnique({
          where: { recipeBookId_userId: { recipeBookId: bookId, userId: user.userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({ following: !!mine, count, canFollow: !!user });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to follow" }, { status: 401 });

  const { bookId } = await request.json().catch(() => ({ bookId: null }));
  const id = typeof bookId === "number" ? bookId : parseInt(bookId, 10);
  if (!id || Number.isNaN(id)) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
  if (!(await publishedBook(id))) return NextResponse.json({ error: "Blog not found" }, { status: 404 });

  await prisma.blogSubscriber.upsert({
    where: { recipeBookId_userId: { recipeBookId: id, userId: user.userId } },
    update: {},
    create: { recipeBookId: id, userId: user.userId },
  });
  const count = await prisma.blogSubscriber.count({ where: { recipeBookId: id } });
  return NextResponse.json({ following: true, count, canFollow: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to follow" }, { status: 401 });

  const bookId = parseBookId(request);
  if (bookId == null) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });

  await prisma.blogSubscriber.deleteMany({ where: { recipeBookId: bookId, userId: user.userId } });
  const count = await prisma.blogSubscriber.count({ where: { recipeBookId: bookId } });
  return NextResponse.json({ following: false, count, canFollow: true });
}
