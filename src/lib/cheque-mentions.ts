/**
 * What a cheque has to carry for its receipt to be exempt.
 *
 * Article 258 of the Code du timbre exempts a receipt for a sum settled by
 * cheque drawn on a banker — as it does postal cheques and bank or postal
 * transfers — but the exemption is conditional: the quittance must state the
 * cheque's date, its number, and the name of the drawee.
 *
 * Probook had one free-text `reference` field, called `cardReference` on the
 * till. So a cheque came out at zero duty, correctly, on a document that could
 * not show why. The amount was right and the paper was not, which is the worse
 * half: under an inspection it is the merchant who carries the difference.
 *
 * Note what this is NOT. Handing the cheque over the counter rather than posting
 * it changes nothing — the delivery method is not a criterion anywhere in the
 * article. Only the mentions are.
 */
export interface ChequeMentions {
  cheque_date?: string | null;
  cheque_number?: string | null;
  cheque_bank?: string | null;
}

/** The payment methods that settle by cheque, whichever screen records them. */
export function isCheque(method: string | null | undefined): boolean {
  return (method ?? "").toUpperCase() === "CHEQUE";
}

/**
 * Which of the three prescribed mentions are missing, empty when none are.
 *
 * Returns the field names rather than a boolean so a form can point at the box
 * that needs filling instead of refusing the whole payment without saying why.
 */
export function missingChequeMentions(
  method: string | null | undefined,
  mentions: ChequeMentions
): Array<keyof ChequeMentions> {
  if (!isCheque(method)) return [];

  const missing: Array<keyof ChequeMentions> = [];
  if (!mentions.cheque_date) missing.push("cheque_date");
  if (!mentions.cheque_number?.trim()) missing.push("cheque_number");
  if (!mentions.cheque_bank?.trim()) missing.push("cheque_bank");
  return missing;
}
