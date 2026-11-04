import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./styles";
import { renderIdentifiers, identifierSummary } from "./identifiers";
import type { CompanySettings, CreditNote } from "@/types";
import { pdfCurrency } from "./text";
import { pdfString } from "./strings";
import { DocumentHeading } from "./DocumentHeading";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { buyerMentions, legalCompanyName } from "@/lib/legal-mentions";
import { getFiscalProfile } from "@/lib/fiscal-profiles";

/**
 * A credit note: the corrective invoice that takes back all or part of an
 * earlier one. It carries the same identities as an invoice, its own number in
 * the credit note sequence, and the number and date of the invoice it
 * corrects.
 */
interface CreditNotePDFProps {
  locale?: string;
  currency?: string;
  fontFamily?: string;
  creditNote: CreditNote;
  company: CompanySettings;
  logoBase64?: string | null;
}

const formatDate = (date: string, locale: string): string =>
  new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(date)
  );

export function CreditNotePDF({
  creditNote,
  company,
  logoBase64,
  locale = "fr",
  currency = DEFAULT_CURRENCY,
  fontFamily,
}: CreditNotePDFProps) {
  const t = (key: string, values?: Record<string, string | number>) => pdfString(key, locale, values);
  const client = creditNote.client;
  const franchise = getFiscalProfile(company.fiscal_profile).id === "FR" && company.vat_franchise;

  return (
    <Document>
      <Page size="A4" style={fontFamily ? [styles.page, { fontFamily }] : styles.page}>
        <DocumentHeading
          company={company}
          logoBase64={logoBase64}
          locale={locale}
          title={t("creditNote.title")}
          number={creditNote.credit_note_number}
          status={{ label: t("creditNote.issued"), style: styles.statusIssued }}
          dates={[{ label: t("creditNote.issueDate"), value: formatDate(creditNote.issue_date, locale) }]}
          recipientLabel={t("invoice.billTo")}
        >
          <Text style={styles.clientName}>{client?.name}</Text>
          {client?.address && <Text style={styles.clientDetail}>{client.address}</Text>}
          {(client?.postal_code || client?.city) && (
            <Text style={styles.clientDetail}>
              {client?.postal_code} {client?.city}
            </Text>
          )}
          {buyerMentions(client).map((m) => (
            <Text key={m.key} style={styles.clientDetail}>
              {pdfString(m.key, locale, m.values)}
            </Text>
          ))}
          {renderIdentifiers(company, client).map((id) => (
            <Text key={id.label} style={styles.clientDetail}>
              {id.label}: {id.value}
            </Text>
          ))}
        </DocumentHeading>

        {creditNote.invoice && (
          <Text style={{ fontSize: 9, marginBottom: 4 }}>
            {t("creditNote.originalInvoice", {
              number: creditNote.invoice.invoice_number,
              date: formatDate(creditNote.invoice.issue_date, locale),
            })}
          </Text>
        )}
        {creditNote.reason && (
          <Text style={{ fontSize: 9, marginBottom: 8, color: "#4a4640" }}>
            {t("creditNote.reason")}: {creditNote.reason}
          </Text>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>{t("invoice.table.description")}</Text>
            <Text style={styles.colQuantity}>{t("invoice.table.quantity")}</Text>
            <Text style={styles.colUnitPrice}>{t("invoice.table.unitPriceHt")}</Text>
            <Text style={styles.colVat}>{t("invoice.table.vat")}</Text>
            <Text style={styles.colTotal}>{t("invoice.table.totalTtc")}</Text>
          </View>
          {creditNote.lines.map((line, i) => (
            <View key={line.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={styles.colDescription}>{line.description}</Text>
              <Text style={styles.colQuantity}>{line.quantity}</Text>
              <Text style={styles.colUnitPrice}>{pdfCurrency(line.unit_price, locale, currency)}</Text>
              <Text style={styles.colVat}>{line.tax_rate}%</Text>
              <Text style={styles.colTotal}>{pdfCurrency(line.total, locale, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("invoice.totals.subtotalHt")}</Text>
              <Text style={styles.totalValue}>{pdfCurrency(creditNote.subtotal, locale, currency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("invoice.totals.vatProducts")}</Text>
              <Text style={styles.totalValue}>{pdfCurrency(creditNote.tax_amount, locale, currency)}</Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalLabelFinal}>{t("creditNote.totalCredited")}</Text>
              <Text style={styles.totalValueFinal}>{pdfCurrency(creditNote.total, locale, currency)}</Text>
            </View>
          </View>
        </View>

        {creditNote.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t("invoice.notes")}</Text>
            <Text style={styles.notesText}>{creditNote.notes}</Text>
          </View>
        )}
        {franchise && <Text style={{ fontSize: 7.5, color: "#635e56", marginTop: 10 }}>{t("legal.fr.vatFranchise")}</Text>}

        <View style={styles.footer} fixed>
          {company.legal_mentions && <Text style={styles.footerText}>{company.legal_mentions}</Text>}
          <Text style={styles.footerText}>
            {legalCompanyName(company)}
            {identifierSummary(company, company) && ` - ${identifierSummary(company, company)}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
