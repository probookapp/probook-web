import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function checkAccountLocked(
  tenantId: string,
  username: string
): Promise<{ locked: boolean; minutesLeft: number }> {
  const windowStart = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);

  const recentFailures = await prisma.loginAttempt.count({
    where: {
      tenantId,
      username,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    const oldest = await prisma.loginAttempt.findFirst({
      where: {
        tenantId,
        username,
        success: false,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "asc" },
    });

    const minutesLeft = oldest
      ? Math.ceil(
          (LOCKOUT_MINUTES * 60 * 1000 -
            (Date.now() - oldest.createdAt.getTime())) /
            60000
        )
      : LOCKOUT_MINUTES;

    return { locked: true, minutesLeft: Math.max(1, minutesLeft) };
  }

  return { locked: false, minutesLeft: 0 };
}

/**
 * Check lockout by IP + username (for non-existent users where tenantId is unknown).
 */
export async function checkAccountLockedByIp(
  ipAddress: string,
  username: string
): Promise<{ locked: boolean; minutesLeft: number }> {
  const windowStart = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);

  const recentFailures = await prisma.loginAttempt.count({
    where: {
      username,
      ipAddress: ipAddress,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    return { locked: true, minutesLeft: LOCKOUT_MINUTES };
  }

  return { locked: false, minutesLeft: 0 };
}

export async function recordLoginAttempt(params: {
  userId?: string;
  username: string;
  tenantId: string;
  ipAddress?: string;
  success: boolean;
}) {
  await prisma.loginAttempt.create({ data: params });
}
