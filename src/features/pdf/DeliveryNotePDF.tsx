import {
  Document,
  Page,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import { styles } from "./styles";
import i18n from "@/i18n";
import type { DeliveryNote, CompanySettings } from "@/types";

// Helper to get PDF translations
const t = (key: string) => i18n.t(`pdf:${key}`);

interface DeliveryNotePDFProps {
  deliveryNote: DeliveryNote;
  company: CompanySettings;
  logoBase64?: string | null;
}

const formatDate = (date: string): string => {
  return new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
};

export function DeliveryNotePDF({ deliveryNote, company, logoBase64 }: DeliveryNotePDFProps) {
  const getStatusStyle = () => {
    switch (deliveryNote.status) {
      case "DELIVERED":
        return styles.statusPaid;
      case "CANCELLED":
        return { ...styles.statusDraft, backgroundColor: "#fee2e2", color: "#dc2626" };
      default:
        return styles.statusDraft;
    }
  };

  const getStatusLabel = () => {
    return t(`deliveryNote.status.${deliveryNote.status}`);
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
          <Text style={styles.documentTitle}>{t("deliveryNote.title")}</Text>
          <View style={[styles.statusBadge, getStatusStyle()]}>
            <Text>{getStatusLabel()}</Text>
          </View>
        </View>

        {/* Document Info & Client */}
        <View style={styles.documentInfo}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{t("deliveryNote.number")}</Text>
            <Text style={styles.infoValue}>{deliveryNote.delivery_note_number}</Text>

            <Text style={styles.infoLabel}>{t("deliveryNote.issueDate")}</Text>
            <Text style={styles.infoValue}>{formatDate(deliveryNote.issue_date)}</Text>

            {deliveryNote.delivery_date && (
              <>
                <Text style={styles.infoLabel}>{t("deliveryNote.deliveryDate")}</Text>
                <Text style={styles.infoValue}>{formatDate(deliveryNote.delivery_date)}</Text>
              </>
            )}
          </View>

          <View style={[styles.infoBlock, styles.clientBox]}>
            <Text style={styles.infoLabel}>{t("deliveryNote.deliverTo")}</Text>
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
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableHeader, { backgroundColor: "#059669" }]}>
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
              <Text style={[styles.colDescription, { flex: 3 }]}>{line.description}</Text>
              <Text style={[styles.colQuantity, { flex: 1, textAlign: "right" }]}>{line.quantity}</Text>
              <Text style={[styles.colUnitPrice, { flex: 1 }]}>{line.unit || "-"}</Text>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={{ marginTop: 20, alignItems: "flex-end" }}>
          <View style={{ backgroundColor: "#f0fdf4", padding: 15, borderRadius: 4, minWidth: 200 }}>
            <Text style={{ fontSize: 10, color: "#047857", fontWeight: "bold" }}>
              {t("deliveryNote.totalItems")}: {deliveryNote.lines.length}
            </Text>
            <Text style={{ fontSize: 10, color: "#047857", marginTop: 4 }}>
              {t("deliveryNote.totalQuantity")}: {deliveryNote.lines.reduce((sum, l) => sum + l.quantity, 0)}
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
            <View style={{ borderWidth: 1, borderColor: "#d1d5db", height: 60, borderRadius: 4 }} />
          </View>
          <View style={{ width: "45%" }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 5 }}>
              {t("deliveryNote.recipientSignature")}
            </Text>
            <View style={{ borderWidth: 1, borderColor: "#d1d5db", height: 60, borderRadius: 4 }} />
            <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 4 }}>
              {t("deliveryNote.receivedInGoodCondition")}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {company.company_name} - {company.siret && `${t("common.siret")}: ${company.siret}`}
            {company.vat_number && ` - ${t("common.vatNumber")}: ${company.vat_number}`}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
