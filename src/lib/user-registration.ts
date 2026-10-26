import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export interface NewAccountInput {
  name: string;
  email: string; // already normalized
  passwordHash: string | null; // null for Google or Apple sign-in
  emailVerifiedAt?: Date | null;
  method?: "password" | "google" | "apple";
  ip?: string | null;
}

// Create a user the way registration does. A pending household invite for the
// email joins that household as a MEMBER; otherwise the user gets a new
// household and owns it. Shared by the register route and Google/Apple sign-in
// so both paths create identical accounts.
export async function createAccount(input: NewAccountInput) {
  const { name, email, passwordHash } = input;

  // Check if there's a pending invite for this email
  const invite = await prisma.householdInvite.findFirst({
    where: { email, status: "PENDING" },
  });

  let householdId: number;

  if (invite) {
    // Join existing household
    householdId = invite.householdId;
    await prisma.householdInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED" },
    });
  } else {
    // Create new household
    const household = await prisma.household.create({
      data: { name: `${name}'s Kitchen` },
    });
    householdId = household.id;
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      householdId,
      role: invite ? "MEMBER" : "OWNER",
      emailVerifiedAt: input.emailVerifiedAt ?? null,
    },
  });

  const via = input.method === "google" ? " with Google" : input.method === "apple" ? " with Apple" : "";
  await audit({
    category: "AUTH",
    action: "REGISTER",
    summary: `${user.name} created an account${via}`,
    actorUserId: user.id,
    actorName: user.name,
    householdId,
    metadata: input.method && input.method !== "password" ? { method: input.method } : undefined,
    ip: input.ip ?? null,
  });

  return user;
}
