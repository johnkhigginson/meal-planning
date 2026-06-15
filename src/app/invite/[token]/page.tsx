import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LemonLogo } from "@/components/shared/LemonLogo";
import { InviteAcceptButton } from "@/components/blog/InviteAcceptButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fdfcf8] p-4 dark:bg-background">
      <div className="mb-6 flex items-center gap-2">
        <LemonLogo className="h-8 w-8" />
        <span className="font-display text-xl font-semibold tracking-tight">My Lemon Kitchen</span>
      </div>
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const invite = await prisma.cookbookInvite.findUnique({
    where: { token },
    select: {
      email: true,
      invitedByName: true,
      acceptedAt: true,
      recipeBook: { select: { id: true, name: true, slug: true, householdId: true } },
    },
  });

  if (!invite) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Invitation not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>This invitation link is invalid or has been withdrawn.</p>
          <Link href="/" className="text-primary hover:underline">Go to My Lemon Kitchen</Link>
        </CardContent>
      </Shell>
    );
  }

  const { recipeBook: book } = invite;
  const inviter = invite.invitedByName || "Someone";
  const user = await getCurrentUser();

  if (invite.acceptedAt) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Already accepted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">You&apos;ve already accepted the invitation to “{book.name}”.</p>
          <Link href={`/books/${book.id}`}>
            <Button className="w-full">Open the cookbook</Button>
          </Link>
        </CardContent>
      </Shell>
    );
  }

  const acceptPath = `/invite/${token}`;

  return (
    <Shell>
      <CardHeader>
        <CardTitle>You&apos;re invited to collaborate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          <strong className="text-foreground">{inviter}</strong> invited you to help with the cookbook{" "}
          <strong className="text-foreground">“{book.name}”</strong>. You&apos;ll be able to add and edit
          recipes and be credited as an author — while keeping your own kitchen separate.
        </p>

        {user && user.householdId === book.householdId ? (
          <>
            <p className="text-muted-foreground">This is your own cookbook — there&apos;s nothing to accept.</p>
            <Link href={`/books/${book.id}`}>
              <Button className="w-full">Open the cookbook</Button>
            </Link>
          </>
        ) : user ? (
          <>
            <p className="text-muted-foreground">
              Signed in as <strong className="text-foreground">{user.name}</strong>.
            </p>
            <InviteAcceptButton token={token} />
          </>
        ) : (
          <div className="space-y-2">
            <Link href={`/register?callbackUrl=${encodeURIComponent(acceptPath)}&email=${encodeURIComponent(invite.email)}`}>
              <Button className="w-full">Create your account &amp; accept</Button>
            </Link>
            <Link href={`/login?callbackUrl=${encodeURIComponent(acceptPath)}`}>
              <Button variant="outline" className="w-full">I already have an account</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Shell>
  );
}
