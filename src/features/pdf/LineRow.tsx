import { Text, View } from "@react-pdf/renderer";
import { styles } from "./styles";
import { renderHtmlToPdf } from "./htmlToPdf";
import { pdfCurrency } from "./text";
import { pdfString } from "./strings";
import type { BundleRole } from "@/lib/bundles";

interface PricedLine {
  id: string;
  description: string;
  description_html: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  total: number;
}

/** A component of a pack, printed under it: smaller, indented, without a price of its own. */
const childText = { fontSize: 8, color: "#635e56" };

/**
 * One line of a quote or an invoice.
 *
 * A pack prints as its own line, at its price, followed by its components:
 * what and how many, and the rate each is taxed at. When those rates differ the
 * pack has no single rate, and each component also states its share of the
 * total, so the reader can tie every VAT base on the document back to a line.
 */
export function PdfLineRow({
  line,
  role,
  mixedRates,
  alt,
  locale,
  currency,
}: {
  line: PricedLine;
  role: BundleRole;
  mixedRates: boolean;
  alt: boolean;
  locale: string;
  currency: string;
}) {
  if (role === "child") {
    return (
      <View style={[styles.tableRow, { paddingTop: 2, paddingBottom: 2 }, alt ? styles.tableRowAlt : {}]}>
        <View style={[styles.colDescription, { paddingLeft: 12 }]}>
          <Text style={childText}>{line.description}</Text>
        </View>
        <Text style={[styles.colQuantity, childText]}>{line.quantity}</Text>
        <Text style={[styles.colUnitPrice, childText]} />
        <Text style={[styles.colVat, childText]}>{line.tax_rate}%</Text>
        <Text style={[styles.colTotal, childText]}>
          {mixedRates ? pdfCurrency(line.total, locale, currency) : ""}
        </Text>
      </View>
    );
  }

  const richTextContent = renderHtmlToPdf(line.description_html);
  return (
    <View style={[styles.tableRow, alt ? styles.tableRowAlt : {}]}>
      <View style={styles.colDescription}>
        {richTextContent || <Text>{line.description}</Text>}
      </View>
      <Text style={styles.colQuantity}>{line.quantity}</Text>
      <Text style={styles.colUnitPrice}>{pdfCurrency(line.unit_price, locale, currency)}</Text>
      <Text style={styles.colVat}>
        {role === "header" && mixedRates ? pdfString("common.mixedVat", locale) : `${line.tax_rate}%`}
      </Text>
      <Text style={styles.colTotal}>{pdfCurrency(line.total, locale, currency)}</Text>
    </View>
  );
}
