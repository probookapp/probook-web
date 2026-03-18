import {
  Document,
  Page,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import { styles } from "./styles";
import { numberToFrenchWords, CURRENCY_WORDS } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { renderHtmlToPdf } from "./htmlToPdf";
import i18n from "@/i18n";
import type { Quote, CompanySettings } from "@/types";

// Helper to get PDF translations
const t = (key: string) => i18n.t(`pdf:${key}`);

interface QuotePDFProps {
  quote: Quote;
  company: CompanySettings;
  logoBase64?: string | null;
}

const formatCurrency = (amount: number): string => {
  const currency = useSettingsStore.getState().currency || "EUR";
  return new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency,
  }).format(amount);
};

const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
};

export function QuotePDF({ quote, company, logoBase64 }: QuotePDFProps) {
  const getStatusStyle = () => {
    switch (quote.status) {
      case "ACCEPTED":
        return styles.statusAccepted;
      case "SENT":
        return styles.statusSent;
      default:
        return styles.statusDraft;
    }
  };

  const getStatusLabel = () => {
    return t(`quote.status.${quote.status}`);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
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
            {company.siret && (
              <Text style={styles.companyDetail}>{t("common.siret")}: {company.siret}</Text>
            )}
            {company.vat_number && (
              <Text style={styles.companyDetail}>
                {t("common.vatNumber")}: {company.vat_number}
              </Text>
            )}
          </View>
        </View>

        {/* Document Title */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={styles.documentTitle}>{t("quote.title")}</Text>
          <View style={[styles.statusBadge, getStatusStyle()]}>
            <Text>{getStatusLabel()}</Text>
          </View>
        </View>

        {/* Document Info & Client */}
        <View style={styles.documentInfo}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{t("quote.number")}</Text>
            <Text style={styles.infoValue}>{quote.quote_number}</Text>

            <Text style={styles.infoLabel}>{t("quote.issueDate")}</Text>
            <Text style={styles.infoValue}>{formatDate(quote.issue_date)}</Text>

            <Text style={styles.infoLabel}>{t("quote.validityDate")}</Text>
            <Text style={styles.infoValue}>{formatDate(quote.validity_date)}</Text>
          </View>

          <View style={[styles.infoBlock, styles.clientBox]}>
            <Text style={styles.infoLabel}>{t("quote.billTo")}</Text>
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
            {quote.client?.siret && (
              <Text style={styles.clientDetail}>
                {t("common.siret")}: {quote.client.siret}
              </Text>
            )}
          </View>
        </View>

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
                <View key={`group-${groupName}`} style={{ backgroundColor: "#e5e7eb", padding: 6 }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: "#374151" }}>{groupName}</Text>
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
                    <Text style={styles.colUnitPrice}>{formatCurrency(line.unit_price)}</Text>
                    <Text style={styles.colVat}>{line.tax_rate}%</Text>
                    <Text style={styles.colTotal}>{formatCurrency(line.total)}</Text>
                  </View>
                );
                rowIndex++;
              });

              // Subtotal for group
              const groupTotalHt = lines.reduce((sum, l) => sum + l.subtotal, 0);
              const groupTotalTtc = lines.reduce((sum, l) => sum + l.total, 0);
              elements.push(
                <View key={`subtotal-${groupName}`} style={{ backgroundColor: "#f3f4f6", padding: 6, flexDirection: "row", justifyContent: "flex-end" }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: "#4b5563", marginRight: 10 }}>
                    {i18n.t("pdf:quote.groupSubtotal", { group: groupName })}: {formatCurrency(groupTotalHt)} {i18n.t("pdf:common.labelHt")} / {formatCurrency(groupTotalTtc)} {i18n.t("pdf:common.labelTtc")}
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
                  <Text style={styles.colUnitPrice}>{formatCurrency(line.unit_price)}</Text>
                  <Text style={styles.colVat}>{line.tax_rate}%</Text>
                  <Text style={styles.colTotal}>{formatCurrency(line.total)}</Text>
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
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("quote.totals.subtotalHt")}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(quote.subtotal)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t("quote.totals.vatProducts")}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(quote.tax_amount)}
              </Text>
            </View>
            {quote.shipping_cost > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("quote.totals.shippingHt")}</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(quote.shipping_cost)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t("quote.totals.shippingVat")} ({quote.shipping_tax_rate}%)</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(quote.shipping_cost * (quote.shipping_tax_rate / 100))}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalLabelFinal}>{t("quote.totals.totalTtc")}</Text>
              <Text style={styles.totalValueFinal}>
                {formatCurrency(
                  quote.total +
                  (quote.shipping_cost > 0
                    ? quote.shipping_cost + quote.shipping_cost * (quote.shipping_tax_rate / 100)
                    : 0)
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
                  <View style={[styles.totalRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb" }]}>
                    <Text style={[styles.totalLabel, { color: "#2563eb" }]}>
                      {t("quote.totals.downPayment")} {quote.down_payment_percent > 0 && quote.down_payment_amount === 0 ? `(${quote.down_payment_percent}%)` : ''}
                    </Text>
                    <Text style={[styles.totalValue, { color: "#2563eb" }]}>
                      {formatCurrency(downPaymentValue)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{t("quote.totals.remaining")}</Text>
                    <Text style={styles.totalValue}>
                      {formatCurrency(totalWithShipping - downPaymentValue)}
                    </Text>
                  </View>
                </>
              );
            })()}
            <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb" }}>
              <Text style={{ fontSize: 8, color: "#6b7280", fontStyle: "italic" }}>
                {t("quote.amountInWords")}: {(() => {
                  const curr = useSettingsStore.getState().currency || "EUR";
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
        <View style={[styles.notes, { backgroundColor: "#dbeafe", marginTop: 15 }]}>
          <Text style={[styles.notesText, { color: "#1d4ed8" }]}>
            {i18n.t("pdf:quote.validityNotice", { date: formatDate(quote.validity_date) })}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {company.legal_mentions && (
            <Text style={styles.footerText}>{company.legal_mentions}</Text>
          )}
          <Text style={styles.footerText}>
            {company.company_name} - {company.siret && `${t("common.siret")}: ${company.siret}`}
            {company.vat_number && ` - ${t("common.vatNumber")}: ${company.vat_number}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
