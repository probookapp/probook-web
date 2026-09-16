import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// A username is typed at login with no business attached, so it has to name one
// person across the whole platform — even though the schema only enforces
// uniqueness inside a tenant (@@unique([tenantId, username])). Comparison ignores
// case: phone keyboards capitalise the first letter, and "Ahmed" and "ahmed"
// must not be two different accounts handed to two different people.

/** Another user, in any business, already answers to this username. */
export async function isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const holder = await prisma.user.findFirst({
    where: {
      username: { equals: username.trim(), mode: "insensitive" },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return holder !== null;
}

const slugPart = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);

/**
 * A free username close to the one refused: the business's name appended
 * first ("caisse" → "caisse-electrosouk"), which reads as what it is, then a
 * number. An admin handed a bare "already taken" has to guess, and guesses
 * collide again.
 */
export async function suggestUsername(username: string, tenantId: string): Promise<string | null> {
  const base = username.trim();
  if (!base) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  const company = tenant ? slugPart(tenant.slug) : "";
  const candidates = [
    ...(company ? [`${base}-${company}`] : []),
    ...Array.from({ length: 8 }, (_, i) => `${base}${i + 2}`),
  ];
  for (const candidate of candidates) {
    if (!(await isUsernameTaken(candidate))) return candidate;
  }
  return null;
}

/** 409 for an admin creating or renaming a user onto a name already in use. */
export async function usernameTakenResponse(username: string, tenantId: string) {
  return NextResponse.json(
    {
      error: "This username is already in use. Choose another one.",
      code: "USERNAME_TAKEN",
      suggestion: await suggestUsername(username, tenantId),
    },
    { status: 409 }
  );
}

/**
 * Active users a login identifier can mean: the username, or the email address
 * (owners sign up with one; staff often have none, so the username stays).
 * A verified address comes first, then the oldest account. More than one only
 * exists for accounts created before the platform-wide username rule, or for an
 * address typed on several unverified accounts; login tries each against the
 * password rather than locking one of them out.
 */
export function findActiveUsersByIdentifier(identifier: string) {
  const value = identifier.trim();
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { username: { equals: value, mode: "insensitive" } },
        ...(value.includes("@") ? [{ email: { equals: value, mode: "insensitive" as const } }] : []),
      ],
    },
    include: { tenant: { select: { status: true } } },
    orderBy: [{ emailVerified: "desc" }, { createdAt: "asc" }],
    take: 5,
  });
}
