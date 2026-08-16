/**
 * The two directions cash can move in the drawer, named once.
 *
 * They used to be named twice and differently: the till sent "CASH_IN" while
 * the validation schema accepted only "IN", so every movement was refused with
 * a 400 and the drawer could not be adjusted at all.
 *
 * The worse half is what would have happened had it got through. The Z report
 * and the session summary both count a movement as an entry with
 * `movementType === "IN"` — anything else falls to the other side. A stored
 * "CASH_IN" would have been counted as money leaving the drawer, and the
 * end-of-day figure would have been wrong by twice the amount, quietly.
 *
 * A third value, "PETTY_CASH", existed in the client type and nowhere else:
 * no screen offered it, no report knew it. It is gone.
 */
export const CASH_MOVEMENT_TYPES = ["IN", "OUT"] as const;

export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

/** Only an entry adds to the drawer; everything else takes from it. */
export function addsToDrawer(type: string): boolean {
  return type === "IN";
}
