import {
  Document,
  Page,
  Text,
  View,
} from "@react-pdf/renderer";
import { styles } from "./styles";
import { identifierSummary } from "./identifiers";
import type { DeliveryNote, CompanySettings } from "@/types";
import { pdfString } from "./strings";
import { DocumentHeading } from "./DocumentHeading";
import { bundleRoles } from "@/lib/bundles";


interface DeliveryNotePDFProps {
  /** Already-resolved document language (see text.ts), not the interface's. */
  locale?: string;
  /** Left unset, the document falls back to Helvetica (no Arabic glyphs). */
  fontFamily?: string;
  deliveryNote: DeliveryNote;
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

export function DeliveryNotePDF({
  deliveryNote,
  company,
  logoBase64,
  locale = "fr",
  fontFamily,
}: DeliveryNotePDFProps) {
  // Words resolved here, not at module scope: the server has no
  // react-i18next to import (see strings.ts).
  const t = (key: string) => pdfString(key, locale);
  // A pack is a header over its components: the components are what is
  // delivered, so they are what the summary counts.
  const roles = bundleRoles(deliveryNote.lines);
  const goods = deliveryNote.lines.filter((_, i) => roles[i].role !== "header");
  const getStatusStyle = () => {
    switch (deliveryNote.status) {
      case "DELIVERED":
        return styles.statusPaid;
      case "CANCELLED":
        return { ...styles.statusDraft, backgroundColor: "#f6d9d5", color: "#963631" };
      default:
        return styles.statusDraft;
    }
  };

  const getStatusLabel = () => {
    return t(`deliveryNote.status.${deliveryNote.status}`);
  };

  return (
    <Document>
      <Page size="A4" style={fontFamily ? [styles.page, { fontFamily }] : styles.page}>
        <DocumentHeading
          company={company}
          logoBase64={logoBase64}
          locale={locale}
          title={t("deliveryNote.title")}
          number={deliveryNote.delivery_note_number}
          status={{ label: getStatusLabel(), style: getStatusStyle() }}
          dates={[
            { label: t("deliveryNote.issueDate"), value: formatDate(deliveryNote.issue_date, locale) },
            ...(deliveryNote.delivery_date
              ? [{ label: t("deliveryNote.deliveryDate"), value: formatDate(deliveryNote.delivery_date, locale) }]
              : []),
          ]}
          recipientLabel={t("deliveryNote.deliverTo")}
        >
          <Text style={styles.clientName}>{deliveryNote.client?.name}</Text>
          {deliveryNote.delivery_address ? (
            <Text style={styles.clientDetail}>{deliveryNote.delivery_address}</Text>
          ) : (
            <>
              {deliveryNote.client?.address && (
                <Text style={styles.clientDetail}>{deliveryNote.client.address}</Text>
              )}
              {(deliveryNote.client?.postal_code || deliveryNote.client?.city) && (
                <Text style={styles.clientDetail}>
                  {deliveryNote.client.postal_code} {deliveryNote.client.city}
                </Text>
              )}
            </>
          )}
          {deliveryNote.client?.phone && (
            <Text style={styles.clientDetail}>{t("common.phone")}: {deliveryNote.client.phone}</Text>
          )}
        </DocumentHeading>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableHeader, { backgroundColor: "#256a4c" }]}>
            <Text style={[styles.colDescription, { flex: 3 }]}>{t("deliveryNote.table.description")}</Text>
            <Text style={[styles.colQuantity, { flex: 1, textAlign: "right" }]}>{t("deliveryNote.table.quantity")}</Text>
            <Text style={[styles.colUnitPrice, { flex: 1 }]}>{t("deliveryNote.table.unit")}</Text>
          </View>

          {/* Table Rows */}
          {deliveryNote.lines.map((line, index) => (
            <View
              key={line.id}
              style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              {/* A pack's components are listed under it, indented. */}
              <Text
                style={[
                  styles.colDescription,
                  { flex: 3 },
                  roles[index].role === "child" ? { paddingLeft: 12, fontSize: 8, color: "#635e56" } : {},
                ]}
              >
                {line.description}
              </Text>
              <Text style={[styles.colQuantity, { flex: 1, textAlign: "right" }]}>{line.quantity}</Text>
              <Text style={[styles.colUnitPrice, { flex: 1 }]}>{line.unit || "-"}</Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={{ marginTop: 20, alignItems: "flex-end" }}>
          <View style={{ backgroundColor: "#eaf4ee", padding: 15, borderRadius: 4, minWidth: 200 }}>
            <Text style={{ fontSize: 10, color: "#1d543d", fontWeight: "bold" }}>
              {t("deliveryNote.totalItems")}: {goods.length}
            </Text>
            <Text style={{ fontSize: 10, color: "#1d543d", marginTop: 4 }}>
              {t("deliveryNote.totalQuantity")}: {goods.reduce((sum, l) => sum + l.quantity, 0)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {deliveryNote.notes && (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>{t("deliveryNote.notesInstructions")}</Text>
            <Text style={styles.notesText}>{deliveryNote.notes}</Text>
          </View>
        )}

        {/* Signature Area */}
        <View style={{ marginTop: 30, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: "45%" }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 5 }}>
              {t("deliveryNote.deliverySignature")}
            </Text>
            <View style={{ borderWidth: 1, borderColor: "#d1ccc4", height: 60, borderRadius: 4 }} />
          </View>
          <View style={{ width: "45%" }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 5 }}>
              {t("deliveryNote.recipientSignature")}
            </Text>
            <View style={{ borderWidth: 1, borderColor: "#d1ccc4", height: 60, borderRadius: 4 }} />
            <Text style={{ fontSize: 8, color: "#837d73", marginTop: 4 }}>
              {t("deliveryNote.receivedInGoodCondition")}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
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
