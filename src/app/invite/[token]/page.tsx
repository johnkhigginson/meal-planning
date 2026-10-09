import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LemonLogo } from "@/components/shared/LemonLogo";
import { cn } from "@/lib/utils";
import { InviteAcceptButton } from "@/components/blog/InviteAcceptButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

// Pill links. buttonVariants lives in a client module, so it can't be called
// from this server component.
const pill =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-px focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring";
const pillSolid =
  "bg-brand font-extrabold text-brand-foreground hover:bg-brand/85 hover:shadow-[0_6px_18px_-8px_rgb(122_92_0/0.55)]";
const pillOutline = "border border-border bg-card hover:bg-muted";

const titleClass = "text-3xl leading-tight font-medium tracking-[-0.015em]";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring"
        >
          <LemonLogo className="h-8 w-8" />
          <span className="font-heading text-xl font-semibold tracking-tight">My Lemon Kitchen</span>
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center px-4 pt-6 pb-20 sm:pt-12">
        <Card className="w-full max-w-md gap-5 rounded-3xl py-7 sm:py-8">
          {children}
        </Card>
      </div>
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
          <h1 className={titleClass}>Invitation not found</h1>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>This invitation link is invalid or has been withdrawn.</p>
          <Link href="/" className="font-bold text-primary underline-offset-4 hover:underline">
            Go to My Lemon Kitchen
          </Link>
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
          <h1 className={titleClass}>Already accepted</h1>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">You&apos;ve already accepted the invitation to “{book.name}”.</p>
          <Link href={`/books/${book.id}`} className={cn(pill, pillSolid)}>
            Open the cookbook
          </Link>
        </CardContent>
      </Shell>
    );
  }

  const acceptPath = `/invite/${token}`;

  return (
    <Shell>
      <CardHeader>
        <h1 className={titleClass}>You&apos;re invited to collaborate</h1>
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
            <Link href={`/books/${book.id}`} className={cn(pill, pillSolid)}>
              Open the cookbook
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
          <div className="flex flex-col gap-2">
            <Link
              href={`/register?callbackUrl=${encodeURIComponent(acceptPath)}&email=${encodeURIComponent(invite.email)}`}
              className={cn(pill, pillSolid)}
            >
              Create your account &amp; accept
            </Link>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(acceptPath)}`}
              className={cn(pill, pillOutline)}
            >
              I already have an account
            </Link>
          </div>
        )}
      </CardContent>
    </Shell>
  );
}
