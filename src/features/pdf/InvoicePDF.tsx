import {
  Document,
  Page,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import { styles } from "./styles";
import { numberToFrenchWords, CURRENCY_WORDS } from "@/lib/number-words";
import { renderHtmlToPdf } from "./htmlToPdf";
import { renderIdentifiers, identifierSummary } from "./identifiers";
import type { Invoice, CompanySettings } from "@/types";
import { pdfCurrency } from "./text";
import { pdfString } from "./strings";


interface InvoicePDFProps {
  /** Already-resolved document language (see text.ts), not the interface's. */
  locale?: string;
  /** The tenant's currency; passed in so no store import is needed. */
  currency?: string;
  /**
   * Typeface for this render. Left unset, the document falls back to
   * Helvetica, which has no Arabic glyphs — the viewer always passes one
   * (see register-client-fonts.ts).
   */
  fontFamily?: string;
  invoice: Invoice;
  company: CompanySettings;
  logoBase64?: string | null;
}


const formatDate = (date: string, locale: string): string => {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
};

export function InvoicePDF({
  invoice,
  company,
  logoBase64,
  locale = "fr",
  currency = "DZD",
  fontFamily,
}: InvoicePDFProps) {
  // Words resolved here, not at module scope: the server has no
  // react-i18next to import (see strings.ts).
  const t = (key: string) => pdfString(key, locale);
  // Lines carry their own (already line-discounted) subtotal; the document
  // discount is what separates their sum from the taxable base.
  const linesSubtotal = invoice.lines.reduce(
    (sum, l) => sum + (l.is_subtotal_line ? 0 : l.subtotal),
    0
  );
  const documentDiscount = Math.max(
    0,
    linesSubtotal - (invoice.subtotal - (invoice.shipping_cost || 0))
  );

  const getStatusStyle = () => {
    switch (invoice.status) {
      case "PAID":
        return styles.statusPaid;
      case "ISSUED":
        return styles.statusIssued;
      default:
        return styles.statusDraft;
    }
  };

  const getStatusLabel = () => {
    return t(`invoice.status.${invoice.status}`);
  };

  return (
    <Document>
      <Page size="A4" style={fontFamily ? [styles.page, { fontFamily }] : styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 15 }}>
            {logoBase64 && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoBase64} style={styles.logo} />
            )}
            <View>
              <Text style={styles.companyName}>{company.company_name}</Text>
              {company.address && (
                <Text style={styles.companyDetail}>{company.address}</Text>
              )}
              {(company.postal_code || company.city) && (
                <Text style={styles.companyDetail}>
                  {company.postal_code} {company.city}
                </Text>
              )}
              {company.phone && (
                <Text style={styles.companyDetail}>{t("common.phone")}: {company.phone}</Text>
              )}
              {company.email && (
                <Text style={styles.companyDetail}>{company.email}</Text>
              )}
            </View>
          </View>
          <View style={styles.companyInfo}>
            {renderIdentifiers(company, company).map((id) => (
              <Text key={id.label} style={styles.companyDetail}>
                {id.label}: {id.value}
              </Text>
            ))}
          </View>
        </View>

        {/* Document Title */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={styles.documentTitle}>{t("invoice.title")}</Text>
          <View style={[styles.statusBadge, getStatusStyle()]}>
            <Text>{getStatusLabel()}</Text>
          </View>
        </View>

        {/* Document Info & Client */}
        <View style={styles.documentInfo}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{t("invoice.number")}</Text>
            <Text style={styles.infoValue}>{invoice.invoice_number}</Text>

            <Text style={styles.infoLabel}>{t("invoice.issueDate")}</Text>
            <Text style={styles.infoValue}>{formatDate(invoice.issue_date, locale)}</Text>

            <Text style={styles.infoLabel}>{t("invoice.dueDate")}</Text>
            <Text style={styles.infoValue}>{formatDate(invoice.due_date, locale)}</Text>
          </View>

          <View style={[styles.infoBlock, styles.clientBox]}>
            <Text style={styles.infoLabel}>{t("invoice.billTo")}</Text>
            <Text style={styles.clientName}>{invoice.client?.name}</Text>
            {invoice.client?.address && (
              <Text style={styles.clientDetail}>{invoice.client.address}</Text>
            )}
            {(invoice.client?.postal_code || invoice.client?.city) && (
              <Text style={styles.clientDetail}>
                {invoice.client.postal_code} {invoice.client.city}
              </Text>
            )}
            {invoice.client?.email && (
              <Text style={styles.clientDetail}>{invoice.client.email}</Text>
            )}
            {renderIdentifiers(company, invoice.client).map((id) => (
              <Text key={id.label} style={styles.clientDetail}>
                {id.label}: {id.value}
              </Text>
            ))}
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>{t("invoice.table.description")}</Text>
            <Text style={styles.colQuantity}>{t("invoice.table.quantity")}</Text>
            <Text style={styles.colUnitPrice}>{t("invoice.table.unitPriceHt")}</Text>
            <Text style={styles.colVat}>{t("invoice.table.vat")}</Text>
            <Text style={styles.colTotal}>{t("invoice.table.totalTtc")}</Text>
          </View>

          {/* Table Rows - organized by groups */}
          {(() => {
            // Group lines by group_name
            const groupedLines: { [key: string]: typeof invoice.lines } = {};
            const ungroupedLines: typeof invoice.lines = [];

            invoice.lines.forEach(line => {
              if (line.group_name) {
                if (!groupedLines[line.group_name]) {
                  groupedLines[line.group_name] = [];
                }
                groupedLines[line.group_name].push(line);
              } else {
                ungroupedLines.push(line);
              }
            });

            const elements: React.ReactNode[] = [];
            let rowIndex = 0;

            // Render grouped lines first
            Object.entries(groupedLines).forEach(([groupName, lines]) => {
              // Group header
              elements.push(
                <View key={`group-${groupName}`} style={{ backgroundColor: "#e5e2dc", padding: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: "#4a4640" }}>{groupName}</Text>
                </View>
              );

              // Lines in group
              lines.forEach(line => {
                // Render rich text or plain description
                const richTextContent = renderHtmlToPdf(line.description_html);
                elements.push(
                  <View
                    key={line.id}
                    style={[styles.tableRow, rowIndex % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <View style={styles.colDescription}>
                      {richTextContent || <Text>{line.description}</Text>}
                    </View>
                    <Text style={styles.colQuantity}>{line.quantity}</Text>
                    <Text style={styles.colUnitPrice}>{pdfCurrency(line.unit_price, locale, currency)}</Text>
                    <Text style={styles.colVat}>{line.tax_rate}%</Text>
                    <Text style={styles.colTotal}>{pdfCurrency(line.total, locale, currency)}</Text>
                  </View>
                );
                rowIndex++;
              });

              // Subtotal for group
              const groupTotalHt = lines.reduce((sum, l) => sum + l.subtotal, 0);
              const groupTotalTtc = lines.reduce((sum, l) => sum + l.total, 0);
              elements.push(
                <View key={`subtotal-${groupName}`} style={{ backgroundColor: "#f2f0ed", padding: 6, flexDirection: "row", justifyContent: "flex-end" }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: "#635e56", marginRight: 10 }}>
                    {pdfString("invoice.groupSubtotal", locale, { group: groupName })}: {pdfCurrency(groupTotalHt, locale, currency)} {t("common.labelHt")} / {pdfCurrency(groupTotalTtc, locale, currency)} {t("common.labelTtc")}
                  </Text>
                </View>
              );
            });

            // Render ungrouped lines
            ungroupedLines.forEach(line => {
              // Render rich text or plain description
              const richTextContent = renderHtmlToPdf(line.description_html);
              elements.push(
                <View
                  key={line.id}
                  style={[styles.tableRow, rowIndex % 2 === 1 ? styles.tableRowAlt : {}]}
                >
                  <View style={styles.colDescription}>
                    {richTextContent || <Text>{line.description}</Text>}
                  </View>
                  <Text style={styles.colQuantity}>{line.quantity}</Text>
                  <Text style={styles.colUnitPrice}>{pdfCurrency(line.unit_price, locale, currency)}</Text>
                  <Text style={styles.colVat}>{line.tax_rate}%</Text>
                  <Text style={styles.colTotal}>{pdfCurrency(line.total, locale, currency)}</Text>
                </View>
              );
              rowIndex++;
            });

            return elements;
          })()}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            {/* A commercial discount is stated, never folded into the prices:
                the reader must be able to rebuild the total from the lines. */}
            {documentDiscount > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("invoice.totals.linesSubtotal")}</Text>
                  <Text style={styles.totalValue}>{pdfCurrency(linesSubtotal, locale, currency)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {t("invoice.totals.discount")}
                    {invoice.discount_percent > 0 ? ` (${invoice.discount_percent}%)` : ""}
                  </Text>
                  <Text style={styles.totalValue}>-{pdfCurrency(documentDiscount, locale, currency)}</Text>
                </View>
              </>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("invoice.totals.subtotalHt")}</Text>
              <Text style={styles.totalValue}>
                {pdfCurrency(invoice.subtotal, locale, currency)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("invoice.totals.vatProducts")}</Text>
              <Text style={styles.totalValue}>
                {pdfCurrency(invoice.tax_amount, locale, currency)}
              </Text>
            </View>
            {invoice.shipping_cost > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("invoice.totals.shippingHt")}</Text>
                  <Text style={styles.totalValue}>
                    {pdfCurrency(invoice.shipping_cost, locale, currency)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("invoice.totals.shippingVat")} ({invoice.shipping_tax_rate}%)</Text>
                  <Text style={styles.totalValue}>
                    {pdfCurrency(invoice.shipping_cost * (invoice.shipping_tax_rate / 100))}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalLabelFinal}>{t("invoice.totals.totalTtc")}</Text>
              <Text style={styles.totalValueFinal}>
                {pdfCurrency(
                  invoice.total +
                  (invoice.shipping_cost > 0
                    ? invoice.shipping_cost + invoice.shipping_cost * (invoice.shipping_tax_rate / 100)
                    : 0)
                )}
              </Text>
            </View>
            {invoice.stamp_duty > 0 && (() => {
              const grandTotal = invoice.total +
                (invoice.shipping_cost > 0
                  ? invoice.shipping_cost + invoice.shipping_cost * (invoice.shipping_tax_rate / 100)
                  : 0);
              return (
                <>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>
                      {t("invoice.totals.stampDuty")}
                      {company.stamp_duty_rate ? ` (${company.stamp_duty_rate}%)` : ""}
                    </Text>
                    <Text style={styles.totalValue}>{pdfCurrency(invoice.stamp_duty, locale, currency)}</Text>
                  </View>
                  <View style={styles.totalRowFinal}>
                    <Text style={styles.totalLabelFinal}>{t("invoice.totals.totalWithStamp")}</Text>
                    <Text style={styles.totalValueFinal}>
                      {pdfCurrency(grandTotal + invoice.stamp_duty, locale, currency)}
                    </Text>
                  </View>
                </>
              );
            })()}
            {(invoice.down_payment_percent > 0 || invoice.down_payment_amount > 0) && (() => {
              const totalWithShipping = invoice.total +
                (invoice.shipping_cost > 0
                  ? invoice.shipping_cost + invoice.shipping_cost * (invoice.shipping_tax_rate / 100)
                  : 0);
              const downPaymentValue = invoice.down_payment_amount > 0
                ? invoice.down_payment_amount
                : totalWithShipping * (invoice.down_payment_percent / 100);
              return (
                <>
                  <View style={[styles.totalRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e2dc" }]}>
                    <Text style={[styles.totalLabel, { color: "#1c5f68" }]}>
                      {t("invoice.totals.downPayment")} {invoice.down_payment_percent > 0 && invoice.down_payment_amount === 0 ? `(${invoice.down_payment_percent}%)` : ''}
                    </Text>
                    <Text style={[styles.totalValue, { color: "#1c5f68" }]}>
                      {pdfCurrency(downPaymentValue, locale, currency)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { fontWeight: "bold" }]}>{t("invoice.totals.remaining")}</Text>
                    <Text style={[styles.totalValue, { fontWeight: "bold" }]}>
                      {pdfCurrency(totalWithShipping - downPaymentValue, locale, currency)}
                    </Text>
                  </View>
                </>
              );
            })()}
            {/* The amount in words is a French legal formula ("arrêté à la
                somme de"), and numberToFrenchWords only speaks French. Printed
                on an Arabic or English document it is a sentence in the wrong
                language on a legal record, which is worse than its absence —
                so it appears on French documents only. An Arabic invoice
                needing its own formula is a question for an accountant, not
                one to invent here. */}
            {locale === "fr" && (
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e2dc" }}>
              <Text style={{ fontSize: 8, color: "#837d73", fontStyle: "italic" }}>
                {t("invoice.amountInWords")}: {(() => {
                  const curr = currency;
                  const words = CURRENCY_WORDS[curr] || { main: curr.toLowerCase(), sub: "centime" };
                  return numberToFrenchWords(
                    invoice.total +
                    (invoice.shipping_cost > 0
                      ? invoice.shipping_cost + invoice.shipping_cost * (invoice.shipping_tax_rate / 100)
                      : 0) +
                    (invoice.stamp_duty || 0),
                    words.main,
                    words.sub
                  );
                })()}
              </Text>
            </View>
            )}
          </View>
        </View>

        {/* Bank Details */}
        {company.bank_details && (
          <View style={styles.bankDetails}>
            <Text style={styles.bankTitle}>{t("invoice.bankDetails")}</Text>
            <Text style={styles.bankText}>{company.bank_details}</Text>
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t("invoice.notes")}</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          {company.legal_mentions && (
            <Text style={styles.footerText}>{company.legal_mentions}</Text>
          )}
          <Text style={styles.footerText}>
            {company.company_name}
            {identifierSummary(company, company) &&
              ` - ${identifierSummary(company, company)}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
