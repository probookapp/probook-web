import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import i18n from "@/i18n";

export interface ReportPDFColumn {
  header: string;
  /** Text alignment for this column (default "left") */
  align?: "left" | "center" | "right";
  /** Relative flex width (default 1) */
  flex?: number;
}

export interface ReportPDFProps {
  title: string;
  /** Optional date-range / context line under the title */
  subtitle?: string;
  columns: ReportPDFColumn[];
  /** Each row is an array of already-formatted cell strings, aligned with columns */
  rows: string[][];
  /** Optional totals shown as label/value pairs under the table */
  totals?: { label: string; value: string }[];
}

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 20, fontWeight: "bold", color: "#2563eb", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#666", marginBottom: 20 },
  generatedAt: { fontSize: 8, color: "#9ca3af", marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2563eb",
    color: "#fff",
    padding: 6,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    padding: 6,
  },
  rowAlt: { backgroundColor: "#f9fafb" },
  cell: { paddingHorizontal: 2 },
  totalsBox: { marginTop: 20, flexDirection: "column", alignItems: "flex-end" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 240,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  totalLabel: { fontSize: 10, color: "#374151" },
  totalValue: { fontSize: 10, fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#9ca3af",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
  },
});

export function ReportPDF({ title, subtitle, columns, rows, totals }: ReportPDFProps) {
  const generatedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        <Text style={s.generatedAt}>
          {i18n.t("reports:pdf.generatedAt", { date: generatedAt })}
        </Text>

        <View style={s.tableHeader}>
          {columns.map((col, i) => (
            <Text
              key={i}
              style={[s.cell, { flex: col.flex ?? 1, textAlign: col.align ?? "left" }]}
            >
              {col.header}
            </Text>
          ))}
        </View>

        {rows.map((row, r) => (
          <View key={r} style={[s.row, r % 2 === 1 ? s.rowAlt : {}]}>
            {row.map((cell, c) => (
              <Text
                key={c}
                style={[
                  s.cell,
                  { flex: columns[c]?.flex ?? 1, textAlign: columns[c]?.align ?? "left" },
                ]}
              >
                {cell}
              </Text>
            ))}
          </View>
        ))}

        {totals && totals.length > 0 ? (
          <View style={s.totalsBox}>
            {totals.map((tot, i) => (
              <View key={i} style={s.totalRow}>
                <Text style={s.totalLabel}>{tot.label}</Text>
                <Text style={s.totalValue}>{tot.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.footer}>{title}</Text>
      </Page>
    </Document>
  );
}
