import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, FileDown, FileSignature } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { toast } from "@/stores/useToastStore";
import { API_BASE_URL } from "@/lib/config";
import { formatCurrency } from "@/lib/utils";
import { useFiscalProfile } from "@/hooks/useFiscalProfile";
import { claimDownloadTab, deliverPdf } from "@/features/pdf/pdf-delivery";
import type { AttestationData } from "@/features/pdf/AttestationPDF";

interface ClosureView {
  period_type: "DAY" | "MONTH" | "YEAR";
  period_key: string;
  entry_count: number;
  total_ttc: string;
  grand_total_period: string;
  perpetual_total: string;
}

interface JournalStatus {
  software: { name: string; version: string };
  chain_ok: boolean;
  chain_broken_at: number | null;
  entry_count: number;
  first_entry_at: string | null;
  closures: ClosureView[];
}

async function getJson<T>(path: string): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, body };
}

/** The previous month, "YYYY-MM": the most recent one that can be archived. */
function lastFinishedMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The secured cash journal (src/lib/pos-journal.ts) seen from the settings:
 * whether its chain holds, the latest closures with their cumulative totals,
 * the archive of a finished month or year, and, under the French regime,
 * the publisher's attestation the merchant keeps for an audit.
 */
export function PosComplianceSection() {
  const { t } = useTranslation("settings");
  const profile = useFiscalProfile();
  const [archiveKind, setArchiveKind] = useState<"MONTH" | "YEAR">("MONTH");
  const [month, setMonth] = useState(lastFinishedMonth);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [downloading, setDownloading] = useState<"archive" | "attestation" | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["pos-journal-status"],
    queryFn: async () => (await getJson<JournalStatus>("/api/pos/fiscal/status")).body,
  });

  const handleArchive = async () => {
    const period = archiveKind === "MONTH" ? month : year;
    setDownloading("archive");
    const tab = claimDownloadTab();
    try {
      const res = await fetch(`${API_BASE_URL}/api/pos/fiscal/archive?period=${encodeURIComponent(period)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        tab?.close();
        toast.error(
          res.status === 404 ? t("posCompliance.archiveEmpty") : res.status === 400 ? t("posCompliance.archiveNotFinished") : t("posCompliance.archiveFailed")
        );
        return;
      }
      deliverPdf(await res.blob(), `journal-caisse-${period}.json`, tab, t("posCompliance.openFile"));
    } catch {
      tab?.close();
      toast.error(t("posCompliance.archiveFailed"));
    } finally {
      setDownloading(null);
    }
  };

  const handleAttestation = async () => {
    setDownloading("attestation");
    const tab = claimDownloadTab();
    try {
      const res = await getJson<AttestationData & { code?: string }>("/api/pos/fiscal/attestation");
      if (!res.ok) {
        tab?.close();
        toast.error(
          res.body.code === "EDITOR_NOT_CONFIGURED" ? t("posCompliance.attestationUnavailable") : t("posCompliance.attestationFailed")
        );
        return;
      }
      // Loaded on demand: the PDF engine is heavy and most visits never need it.
      const [{ pdf }, { AttestationPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/features/pdf/AttestationPDF"),
      ]);
      const blob = await pdf(<AttestationPDF data={res.body} />).toBlob();
      deliverPdf(blob, "attestation-logiciel-de-caisse.pdf", tab, t("posCompliance.openFile"));
    } catch {
      tab?.close();
      toast.error(t("posCompliance.attestationFailed"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("posCompliance.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("posCompliance.description")}</p>

        {isLoading || !status ? (
          <div className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        ) : (
          <>
            <div
              role="status"
              className={
                status.chain_ok
                  ? "flex items-start gap-2 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-800 dark:border-success-800 dark:bg-success-950 dark:text-success-200"
                  : "flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800 dark:border-danger-800 dark:bg-danger-950 dark:text-danger-200"
              }
            >
              {status.chain_ok ? <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" /> : <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />}
              <div>
                <p className="font-medium">
                  {status.chain_ok
                    ? t("posCompliance.chainOk", { count: status.entry_count })
                    : t("posCompliance.chainBroken", { sequence: status.chain_broken_at })}
                </p>
                <p className="text-xs opacity-80">
                  {t("posCompliance.software", { name: status.software.name, version: status.software.version })}
                </p>
              </div>
            </div>

            {status.closures.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-start text-xs text-gray-500 dark:text-gray-400">
                      <th className="py-1 pe-3 text-start font-medium">{t("posCompliance.lastClosure")}</th>
                      <th className="py-1 pe-3 text-end font-medium">{t("posCompliance.periodTotal")}</th>
                      <th className="py-1 pe-3 text-end font-medium">{t("posCompliance.grandTotal")}</th>
                      <th className="py-1 text-end font-medium">{t("posCompliance.perpetualTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.closures.map((c) => (
                      <tr key={c.period_type} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 pe-3">
                          {t(`posCompliance.periods.${c.period_type}`)} {c.period_key}
                        </td>
                        <td className="py-1.5 pe-3 text-end tabular-nums">{formatCurrency(Number(c.total_ttc))}</td>
                        <td className="py-1.5 pe-3 text-end tabular-nums">{formatCurrency(Number(c.grand_total_period))}</td>
                        <td className="py-1.5 text-end tabular-nums">{formatCurrency(Number(c.perpetual_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("posCompliance.archiveTitle")}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("posCompliance.archiveHint")}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Select
                label={t("posCompliance.archivePeriod")}
                value={archiveKind}
                onChange={(e) => setArchiveKind(e.target.value as "MONTH" | "YEAR")}
                options={[
                  { value: "MONTH", label: t("posCompliance.periods.MONTH") },
                  { value: "YEAR", label: t("posCompliance.periods.YEAR") },
                ]}
              />
            </div>
            <div className="w-40">
              {archiveKind === "MONTH" ? (
                <Input
                  label={t("posCompliance.periods.MONTH")}
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              ) : (
                <Input
                  label={t("posCompliance.periods.YEAR")}
                  type="number"
                  min="2020"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              )}
            </div>
            <Button type="button" variant="secondary" onClick={handleArchive} isLoading={downloading === "archive"}>
              <FileDown className="h-4 w-4 me-2" />
              {t("posCompliance.downloadArchive")}
            </Button>
          </div>
        </div>

        {profile.id === "FR" && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("posCompliance.attestationTitle")}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("posCompliance.attestationHint")}</p>
            <Button type="button" variant="secondary" onClick={handleAttestation} isLoading={downloading === "attestation"}>
              <FileSignature className="h-4 w-4 me-2" />
              {t("posCompliance.downloadAttestation")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
