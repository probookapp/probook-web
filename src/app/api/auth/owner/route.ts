import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { getOwnerUserId, transferOwnership } from "@/lib/tenant-owner";

/**
 * Who owns the business, and how it changes hands.
 *
 * The owner cannot be demoted, deactivated or deleted — that is what keeps a
 * business from ending up with nobody able to manage it. The cost of that rule
 * is this route: without a way to hand the business over, an owner who leaves
 * the company would lock it to someone who is gone, and the only way out would
 * be for platform staff to impersonate them.
 *
 * Only the owner may hand it over. An administrator cannot take the business
 * from the person who created it — that would reopen the hole from the other
 * side.
 */
export const GET = withAdmin(async (_req, { tenantId }) => {
  return NextResponse.json({ owner_user_id: await getOwnerUserId(tenantId) });
});

export const POST = withAdmin(async (req, { session, tenantId }) => {
  const body = (await req.json().catch(() => ({}))) as { user_id?: string };
  if (!body.user_id) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const currentOwner = await getOwnerUserId(tenantId);
  if (!currentOwner) {
    return NextResponse.json(
      { error: "This business has no recorded owner." },
      { status: 409 }
    );
  }

  if (session.userId !== currentOwner) {
    return NextResponse.json(
      {
        error: "Only the business owner can hand the business over.",
        code: "NOT_THE_OWNER",
      },
      { status: 403 }
    );
  }

  const failure = await transferOwnership(tenantId, currentOwner, body.user_id);
  if (failure) {
    return NextResponse.json({ ...failure, code: "TRANSFER_REFUSED" }, { status: 400 });
  }

  return NextResponse.json({ owner_user_id: body.user_id });
});
