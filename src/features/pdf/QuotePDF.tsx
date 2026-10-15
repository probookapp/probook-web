import {
  Document,
  Page,
  Text,
  View,
} from "@react-pdf/renderer";
import { styles } from "./styles";
import { numberToFrenchWords, CURRENCY_WORDS } from "@/lib/number-words";
import { renderIdentifiers, identifierSummary } from "./identifiers";
import type { Quote, CompanySettings } from "@/types";
import { pdfCurrency } from "./text";
import { pdfString } from "./strings";
import { PdfLineRow } from "./LineRow";
import { DocumentHeading } from "./DocumentHeading";
import { bundleRoles, isPresentationLine } from "@/lib/bundles";
import { vatBreakdown } from "@/lib/document-totals";
import { DEFAULT_CURRENCY } from "@/lib/currencies";


interface QuotePDFProps {
  /** Already-resolved document language (see text.ts), not the interface's. */
  locale?: string;
  /** Left unset, the document falls back to Helvetica (no Arabic glyphs). */
  fontFamily?: string;
  /** The tenant's currency; passed in so no store import is needed. */
  currency?: string;
  quote: Quote;
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

export function QuotePDF({
  quote,
  company,
  logoBase64,
  locale = "fr",
  currency = DEFAULT_CURRENCY,
  fontFamily,
}: QuotePDFProps) {
  // Words resolved here, not at module scope: the server has no
  // react-i18next to import (see strings.ts).
  const t = (key: string) => pdfString(key, locale);
  const getStatusStyle = () => {
    switch (quote.status) {
      case "ACCEPTED":
        return styles.statusAccepted;
      case "REFUSED":
        return styles.statusRefused;
      case "SENT":
        return styles.statusSent;
      default:
        return styles.statusDraft;
    }
  };

  const getStatusLabel = () => {
    return t(`quote.status.${quote.status}`);
  };

  // Lines carry their own (already line-discounted) subtotal; the document
  // discount is what separates their sum from the taxable base.
  // A pack header is worth its components, which are lines of their own.
  const linesSubtotal = quote.lines.reduce(
    (sum, l) => sum + (isPresentationLine(l) ? 0 : l.subtotal),
    0
  );
  // Which lines are a pack and which its components (src/lib/bundles.ts).
  const roles = new Map(bundleRoles(quote.lines).map((r, i) => [quote.lines[i].id, r]));
  // A pack may print as its one line. Its components still print when they
  // carry different VAT rates: each rate's base must tie back to a line.
  const showBundleDetail = company.print_bundle_detail ?? true;
  // Several VAT rates on one document: each base and each tax is stated.
  const vatRates = vatBreakdown({
    lines: quote.lines,
    discountPercent: quote.discount_percent,
    discountAmount: quote.discount_amount,
    currency,
  });
  const documentDiscount = Math.max(
    0,
    linesSubtotal - (quote.subtotal - (quote.shipping_cost || 0))
  );

  return (
    <Document>
      <Page size="A4" style={fontFamily ? [styles.page, { fontFamily }] : styles.page}>
        <DocumentHeading
          company={company}
          logoBase64={logoBase64}
          locale={locale}
          title={t("quote.title")}
          number={quote.quote_number}
          status={{ label: getStatusLabel(), style: getStatusStyle() }}
          dates={[
            { label: t("quote.issueDate"), value: formatDate(quote.issue_date, locale) },
            { label: t("quote.validityDate"), value: formatDate(quote.validity_date, locale) },
          ]}
          recipientLabel={t("quote.billTo")}
        >
          <Text style={styles.clientName}>{quote.client?.name}</Text>
          {quote.client?.address && (
            <Text style={styles.clientDetail}>{quote.client.address}</Text>
          )}
          {(quote.client?.postal_code || quote.client?.city) && (
            <Text style={styles.clientDetail}>
              {quote.client.postal_code} {quote.client.city}
            </Text>
          )}
          {quote.client?.email && (
            <Text style={styles.clientDetail}>{quote.client.email}</Text>
          )}
          {renderIdentifiers(company, quote.client).map((id) => (
            <Text key={id.label} style={styles.clientDetail}>
              {id.label}: {id.value}
            </Text>
          ))}
        </DocumentHeading>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>{t("quote.table.description")}</Text>
            <Text style={styles.colQuantity}>{t("quote.table.quantity")}</Text>
            <Text style={styles.colUnitPrice}>{t("quote.table.unitPriceHt")}</Text>
            <Text style={styles.colVat}>{t("quote.table.vat")}</Text>
            <Text style={styles.colTotal}>{t("quote.table.totalTtc")}</Text>
          </View>

          {/* Table Rows - organized by groups */}
          {(() => {
            // Group lines by group_name
            const groupedLines: { [key: string]: typeof quote.lines } = {};
            const ungroupedLines: typeof quote.lines = [];

            quote.lines.forEach(line => {
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
                const { role, mixedRates } = roles.get(line.id) ?? { role: "plain" as const, mixedRates: false };
                if (role === "child" && !mixedRates && !showBundleDetail) return;
                elements.push(
                  <PdfLineRow
                    key={line.id}
                    line={line}
                    role={role}
                    mixedRates={mixedRates}
                    alt={rowIndex % 2 === 1}
                    locale={locale}
                    currency={currency}
                  />
                );
                rowIndex++;
              });

              // Subtotal for group
              // A pack header is worth its components: counted once, through them.
              const valued = lines.filter((l) => !isPresentationLine(l));
              const groupTotalHt = valued.reduce((sum, l) => sum + l.subtotal, 0);
              const groupTotalTtc = valued.reduce((sum, l) => sum + l.total, 0);
              elements.push(
                <View key={`subtotal-${groupName}`} style={{ backgroundColor: "#f2f0ed", padding: 6, flexDirection: "row", justifyContent: "flex-end" }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: "#635e56", marginRight: 10 }}>
                    {pdfString("quote.groupSubtotal", locale, { group: groupName })}: {pdfCurrency(groupTotalHt, locale, currency)} {t("common.labelHt")} / {pdfCurrency(groupTotalTtc, locale, currency)} {t("common.labelTtc")}
                  </Text>
                </View>
              );
            });

            // Render ungrouped lines
            ungroupedLines.forEach(line => {
              const { role, mixedRates } = roles.get(line.id) ?? { role: "plain" as const, mixedRates: false };
              if (role === "child" && !mixedRates && !showBundleDetail) return;
              elements.push(
                <PdfLineRow
                  key={line.id}
                  line={line}
                  role={role}
                  mixedRates={mixedRates}
                  alt={rowIndex % 2 === 1}
                  locale={locale}
                  currency={currency}
                />
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
                  <Text style={styles.totalLabel}>{t("quote.totals.linesSubtotal")}</Text>
                  <Text style={styles.totalValue}>{pdfCurrency(linesSubtotal, locale, currency)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {t("quote.totals.discount")}
                    {quote.discount_percent > 0 ? ` (${quote.discount_percent}%)` : ""}
                  </Text>
                  <Text style={styles.totalValue}>-{pdfCurrency(documentDiscount, locale, currency)}</Text>
                </View>
              </>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("quote.totals.subtotalHt")}</Text>
              <Text style={styles.totalValue}>
                {pdfCurrency(quote.subtotal, locale, currency)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("quote.totals.vatProducts")}</Text>
              <Text style={styles.totalValue}>
                {pdfCurrency(quote.tax_amount, locale, currency)}
              </Text>
            </View>
            {vatRates.length > 1 &&
              vatRates.map((r) => (
                <View key={`vat-${r.rate}`} style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { fontSize: 8 }]}>
                    {pdfString("common.vatAtRate", locale, { rate: r.rate, base: pdfCurrency(r.base, locale, currency) })}
                  </Text>
                  <Text style={[styles.totalValue, { fontSize: 8 }]}>{pdfCurrency(r.tax, locale, currency)}</Text>
                </View>
              ))}
            {quote.shipping_cost > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("quote.totals.shippingHt")}</Text>
                  <Text style={styles.totalValue}>
                    {pdfCurrency(quote.shipping_cost, locale, currency)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("quote.totals.shippingVat")} ({quote.shipping_tax_rate}%)</Text>
                  <Text style={styles.totalValue}>
                    {pdfCurrency(quote.shipping_cost * (quote.shipping_tax_rate / 100), locale, currency)}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalLabelFinal}>{t("quote.totals.totalTtc")}</Text>
              <Text style={styles.totalValueFinal}>
                {pdfCurrency(
                  quote.total +
                  (quote.shipping_cost > 0
                    ? quote.shipping_cost + quote.shipping_cost * (quote.shipping_tax_rate / 100)
                    : 0),
                  locale,
                  currency
                )}
              </Text>
            </View>
            {(quote.down_payment_percent > 0 || quote.down_payment_amount > 0) && (() => {
              const totalWithShipping = quote.total +
                (quote.shipping_cost > 0
                  ? quote.shipping_cost + quote.shipping_cost * (quote.shipping_tax_rate / 100)
                  : 0);
              const downPaymentValue = quote.down_payment_amount > 0
                ? quote.down_payment_amount
                : totalWithShipping * (quote.down_payment_percent / 100);
              return (
                <>
                  <View style={[styles.totalRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e2dc" }]}>
                    <Text style={[styles.totalLabel, { color: "#1c5f68" }]}>
                      {t("quote.totals.downPayment")} {quote.down_payment_percent > 0 && quote.down_payment_amount === 0 ? `(${quote.down_payment_percent}%)` : ''}
                    </Text>
                    <Text style={[styles.totalValue, { color: "#1c5f68" }]}>
                      {pdfCurrency(downPaymentValue, locale, currency)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{t("quote.totals.remaining")}</Text>
                    <Text style={styles.totalValue}>
                      {pdfCurrency(totalWithShipping - downPaymentValue, locale, currency)}
                    </Text>
                  </View>
                </>
              );
            })()}
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e2dc" }}>
              <Text style={{ fontSize: 8, color: "#837d73", fontStyle: "italic" }}>
                {t("quote.amountInWords")}: {(() => {
                  const curr = currency;
                  const words = CURRENCY_WORDS[curr] || { main: curr.toLowerCase(), sub: "centime" };
                  return numberToFrenchWords(
                    quote.total +
                    (quote.shipping_cost > 0
                      ? quote.shipping_cost + quote.shipping_cost * (quote.shipping_tax_rate / 100)
                      : 0),
                    words.main,
                    words.sub
                  );
                })()}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t("quote.notes")}</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Validity Notice */}
        <View style={[styles.notes, { backgroundColor: "#d3e9e9", marginTop: 15 }]}>
          <Text style={[styles.notesText, { color: "#174c55" }]}>
            {pdfString("quote.validityNotice", locale, { date: formatDate(quote.validity_date, locale) })}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
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
