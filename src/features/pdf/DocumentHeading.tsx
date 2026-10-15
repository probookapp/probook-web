import type { ReactNode } from "react";
import { Image, Text, View, type Styles } from "@react-pdf/renderer";
import { styles } from "./styles";
import { renderIdentifiers } from "./identifiers";
import { pdfString } from "./strings";
import type { CompanySettings } from "@/types";

/**
 * The top of a quote, an invoice or a delivery note: who sends it, what it is,
 * when, and to whom.
 *
 * Kept compact on purpose: the lines are what the reader came for, so the
 * title shares its row with the number and the status, the dates are one line
 * each, and the recipient sits beside them rather than under them.
 */
export function DocumentHeading({
  company,
  logoBase64,
  locale,
  title,
  number,
  status,
  dates,
  recipientLabel,
  children,
}: {
  company: CompanySettings;
  logoBase64?: string | null;
  locale: string;
  title: string;
  number: string;
  status: { label: string; style: Styles[string] };
  dates: Array<{ label: string; value: string }>;
  recipientLabel: string;
  /** The recipient's name and details, under `recipientLabel`. */
  children: ReactNode;
}) {
  return (
    <>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          {logoBase64 && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoBase64} style={styles.logo} />
          )}
          <View>
            <Text style={styles.companyName}>{company.company_name}</Text>
            {company.address && <Text style={styles.companyDetail}>{company.address}</Text>}
            {(company.postal_code || company.city) && (
              <Text style={styles.companyDetail}>
                {company.postal_code} {company.city}
              </Text>
            )}
            {company.phone && (
              <Text style={styles.companyDetail}>
                {pdfString("common.phone", locale)}: {company.phone}
              </Text>
            )}
            {company.email && <Text style={styles.companyDetail}>{company.email}</Text>}
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

      <View style={styles.documentInfo}>
        <View style={styles.infoBlock}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={styles.documentTitle}>{title}</Text>
            <View style={[styles.statusBadge, status.style]}>
              <Text>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.documentNumber}>{number}</Text>
          {dates.map((d) => (
            <View key={d.label} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{d.label}:</Text>
              <Text style={styles.metaValue}>{d.value}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.infoBlock, styles.clientBox]}>
          <Text style={styles.infoLabel}>{recipientLabel}</Text>
          {children}
        </View>
      </View>
    </>
  );
}
