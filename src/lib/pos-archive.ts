/**
 * Archives and verification of the secured cash journal
 * (BOI-TVA-DECLA-30-10-30 §220-§260).
 *
 * An archive freezes a closed month or year: every journal entry from the
 * period's first one up to the CLOSURE entry that sealed it, the period's
 * closures, the hashes that chain them, and a signature over the whole file.
 * The format is plain JSON (an open format) and carries a notice in French,
 * as the administration requires. Each generation is itself journaled as an
 * ARCHIVE entry, so the trail of archives is kept too.
 */
import { prisma } from "@/lib/db";
import {
  appendJournal,
  FISCAL_SOFTWARE,
  GENESIS_HASH,
  journalAmount,
  signDocument,
  verifyChain,
  type ChainVerdict,
} from "@/lib/pos-journal";
import { closePendingPeriods, PROFILE_TIMEZONES, localDay } from "@/lib/pos-closures";
import { getFiscalProfile } from "@/lib/fiscal-profiles";

const BATCH = 2000;

/** Re-walk a tenant's whole chain, in batches. */
export async function verifyTenantJournal(tenantId: string): Promise<ChainVerdict> {
  let previous = GENESIS_HASH;
  let next = 1;
  let checked = 0;
  for (;;) {
    const batch = await prisma.posJournalEntry.findMany({
      where: { tenantId, sequence: { gte: next } },
      orderBy: { sequence: "asc" },
      take: BATCH,
    });
    if (batch.length === 0) return { ok: true, checked, lastHash: previous };
    const verdict = verifyChain(batch, previous, next);
    if (!verdict.ok) return { ...verdict, checked: checked + verdict.checked };
    checked += verdict.checked;
    previous = verdict.lastHash;
    next += batch.length;
  }
}

export async function journalStatus(tenantId: string) {
  // Closures are due as soon as a day ends; this screen is a natural moment.
  await closePendingPeriods(tenantId);
  const [verdict, entryCount, first, lastClosures] = await Promise.all([
    verifyTenantJournal(tenantId),
    prisma.posJournalEntry.count({ where: { tenantId } }),
    prisma.posJournalEntry.findFirst({
      where: { tenantId },
      orderBy: { sequence: "asc" },
      select: { occurredAt: true },
    }),
    Promise.all(
      (["DAY", "MONTH", "YEAR"] as const).map((periodType) =>
        prisma.posClosure.findFirst({
          where: { tenantId, periodType },
          orderBy: { periodKey: "desc" },
          select: { periodType: true, periodKey: true, totalTtc: true, grandTotalPeriod: true, perpetualTotal: true, entryCount: true },
        })
      )
    ),
  ]);
  return {
    software: FISCAL_SOFTWARE,
    chain: verdict,
    entryCount,
    firstEntryAt: first?.occurredAt ?? null,
    closures: lastClosures.filter(Boolean).map((c) => ({
      period_type: c!.periodType,
      period_key: c!.periodKey,
      entry_count: c!.entryCount,
      total_ttc: journalAmount(c!.totalTtc),
      grand_total_period: journalAmount(c!.grandTotalPeriod),
      perpetual_total: journalAmount(c!.perpetualTotal),
    })),
  };
}

const NOTICE_FR = [
  "Archive du journal de caisse sécurisé (article 286, I, 3° bis du code général des impôts).",
  "Format : JSON (texte UTF-8), lisible par tout éditeur de texte ou tableur.",
  "« entries » : chaque événement enregistré, dans l'ordre de leur numéro de séquence (« sequence »), sans trou.",
  "Types d'événements (« kind ») : SALE = vente en caisse ; CANCELLATION = annulation d'un ticket, enregistrée en négatif ; REFUND = remboursement (avoir), en négatif ; PAYMENT = encaissement d'une facture ; PAYMENT_REVERSAL = suppression d'un encaissement, en négatif ; CLOSURE = clôture journalière, mensuelle ou annuelle ; ARCHIVE = génération d'une archive.",
  "« amount » : montant toutes taxes comprises, signé. Les corrections sont des opérations en moins, jamais des modifications de l'enregistrement d'origine.",
  "« payload » : les données d'origine de l'événement, lignes (désignation, quantité, prix unitaire, HT, taux et montant de TVA, TTC), totaux, modes de règlement, opérateur et caisse.",
  "Chaînage : « hash » est une empreinte HMAC-SHA256 couvrant le contenu de l'entrée et l'empreinte de l'entrée précédente (« previousHash »). Toute suppression, insertion ou modification rompt la chaîne à partir de l'entrée concernée.",
  "« closures » : clôtures de la période, avec le total de la période, le grand total depuis le début de l'exercice (« grandTotalPeriod ») et le total perpétuel depuis la première utilisation (« perpetualTotal »).",
  "« inPeriod » vaut false pour les entrées postérieures à la fin de la période mais antérieures à la clôture qui la scelle : elles sont incluses pour que la chaîne reste continue.",
  "« signature » : empreinte HMAC-SHA256 de l'ensemble du fichier hors signature. La clé de vérification est communiquée à l'administration sur demande par l'éditeur.",
  "Les montants sont exprimés dans la devise de l'entreprise (« company.currency »). Les dates sont en UTC (ISO 8601) ; les périodes sont découpées dans le fuseau « period.timeZone ».",
];

export class ArchiveError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** "2026" or "2026-10", finished, with a closure: build its archive. */
export async function buildArchive(tenantId: string, period: string, requestedBy: { id: string; name: string | null }) {
  if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period)) {
    throw new ArchiveError("period must be YYYY or YYYY-MM", 400);
  }
  const periodType = period.length === 4 ? "YEAR" : "MONTH";
  await closePendingPeriods(tenantId);

  const settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  const timeZone = PROFILE_TIMEZONES[getFiscalProfile(settings?.fiscalProfile).id];
  const today = localDay(new Date(), timeZone);
  if (today.slice(0, period.length) <= period) {
    throw new ArchiveError("Only a finished period can be archived", 400);
  }

  const closure = await prisma.posClosure.findFirst({ where: { tenantId, periodType, periodKey: period } });
  if (!closure) throw new ArchiveError("Nothing was recorded in this period", 404);

  // One contiguous run of the chain, so it can be re-walked on its own: from
  // the period's first sale, or from just after the previous period's sealing
  // entry, if that comes first, so consecutive archives leave no hole, up to
  // the entry that sealed this period. When closures were caught up late, the
  // run also holds entries of a neighbouring period; "inPeriod" says which.
  const previousClosure = await prisma.posClosure.findFirst({
    where: { tenantId, periodType, periodKey: { lt: period } },
    orderBy: { periodKey: "desc" },
    select: { journalSequence: true },
  });
  const fromSequence = Math.min(
    (previousClosure?.journalSequence ?? 0) + 1,
    closure.firstSequence ?? closure.journalSequence
  );
  const entries = await prisma.posJournalEntry.findMany({
    where: { tenantId, sequence: { gte: fromSequence, lte: closure.journalSequence } },
    orderBy: { sequence: "asc" },
  });
  const chain = verifyChain(entries, entries[0]?.previousHash ?? GENESIS_HASH, fromSequence);
  if (!chain.ok) {
    // Never hand out a signed archive of a chain that does not hold.
    throw new ArchiveError(`The journal chain is broken at entry ${chain.brokenAt}`, 409);
  }
  const closures = await prisma.posClosure.findMany({
    where: { tenantId, periodKey: { startsWith: period } },
    orderBy: [{ periodType: "asc" }, { periodKey: "asc" }],
  });

  const content = {
    format: "probook-pos-journal-archive",
    formatVersion: 1,
    notice: NOTICE_FR,
    software: FISCAL_SOFTWARE,
    company: {
      name: settings?.companyName ?? null,
      siret: settings?.siret ?? null,
      vatNumber: settings?.vatNumber ?? null,
      address: [settings?.address, settings?.postalCode, settings?.city].filter(Boolean).join(" ") || null,
      currency: settings?.currency ?? null,
      fiscalProfile: settings?.fiscalProfile ?? null,
    },
    period: { type: periodType, key: period, timeZone },
    generatedAt: new Date().toISOString(),
    chain: {
      firstSequence: entries[0]?.sequence ?? null,
      lastSequence: entries[entries.length - 1]?.sequence ?? null,
      previousHash: entries[0]?.previousHash ?? null,
      lastHash: entries[entries.length - 1]?.hash ?? null,
      verifiedAtGeneration: chain.ok,
    },
    closures: closures.map((c) => ({
      periodType: c.periodType,
      periodKey: c.periodKey,
      entryCount: c.entryCount,
      firstSequence: c.firstSequence,
      lastSequence: c.lastSequence,
      totalTtc: journalAmount(c.totalTtc),
      breakdown: c.breakdown,
      grandTotalPeriod: journalAmount(c.grandTotalPeriod),
      perpetualTotal: journalAmount(c.perpetualTotal),
      journalSequence: c.journalSequence,
      hash: c.hash,
    })),
    entries: entries.map((e) => ({
      sequence: e.sequence,
      kind: e.kind,
      referenceId: e.referenceId,
      amount: journalAmount(e.amount),
      occurredAt: e.occurredAt.toISOString(),
      inPeriod:
        e.kind === "CLOSURE"
          ? String((e.payload as { periodKey?: string } | null)?.periodKey ?? "").startsWith(period)
          : localDay(e.occurredAt, timeZone).startsWith(period),
      payload: e.payload,
      previousHash: e.previousHash,
      hash: e.hash,
    })),
  };
  const signature = signDocument(content);

  // The generation itself is traced (§240).
  await prisma.$transaction((tx) =>
    appendJournal(tx, {
      tenantId,
      kind: "ARCHIVE",
      payload: {
        period,
        firstSequence: content.chain.firstSequence,
        lastSequence: content.chain.lastSequence,
        entryCount: entries.length,
        signature,
        requestedBy,
      },
    })
  );

  return { ...content, signature };
}
