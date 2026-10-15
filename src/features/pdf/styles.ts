import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  // Tight on purpose: the top of the page and the height of each line decide
  // how many lines fit, and a customer reads a quote for its lines. The bottom
  // margin leaves room for the footer, which is drawn over the page.
  page: {
    paddingTop: 28,
    paddingHorizontal: 32,
    paddingBottom: 64,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  logo: {
    width: 100,
    height: 45,
    objectFit: "contain",
  },
  companyInfo: {
    textAlign: "right",
  },
  companyName: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 9,
    color: "#635e56",
    marginBottom: 1,
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1c5f68",
  },
  documentNumber: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 2,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 1,
  },
  metaLabel: {
    fontSize: 9,
    color: "#635e56",
    marginRight: 4,
  },
  metaValue: {
    fontSize: 9,
  },
  documentInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  infoBlock: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 8,
    color: "#635e56",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  clientBox: {
    backgroundColor: "#f2f0ed",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  clientName: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
  },
  clientDetail: {
    fontSize: 9,
    color: "#4a4640",
    marginBottom: 1,
  },
  table: {
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1c5f68",
    color: "#fff",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2dc",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  tableRowAlt: {
    backgroundColor: "#faf9f7",
  },
  colDescription: {
    width: "40%",
  },
  colQuantity: {
    width: "12%",
    textAlign: "center",
  },
  colUnitPrice: {
    width: "16%",
    textAlign: "right",
  },
  colVat: {
    width: "12%",
    textAlign: "center",
  },
  colTotal: {
    width: "20%",
    textAlign: "right",
  },
  totalsContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  totalsBox: {
    // 230, not 200: Arabic says "المجموع (شامل الضريبة)" where French says
    // "Total TTC", and a box sized to the shorter language pushes the longer
    // one straight through the figure beside it.
    width: 230,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2dc",
  },
  totalLabel: {
    fontSize: 10,
    color: "#4a4640",
    flex: 1,
    paddingRight: 8,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    flexShrink: 0,
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    backgroundColor: "#1c5f68",
    color: "#fff",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  totalLabelFinal: {
    fontSize: 12,
    fontWeight: "bold",
    flex: 1,
    paddingRight: 8,
  },
  totalValueFinal: {
    fontSize: 12,
    fontWeight: "bold",
    flexShrink: 0,
  },
  notes: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f6e5c8",
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: "#613e16",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    textAlign: "center",
    fontSize: 8,
    color: "#a8a299",
    borderTopWidth: 1,
    borderTopColor: "#e5e2dc",
    paddingTop: 6,
  },
  footerText: {
    marginBottom: 2,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
  statusDraft: {
    backgroundColor: "#e5e2dc",
    color: "#4a4640",
  },
  statusSent: {
    backgroundColor: "#d3e9e9",
    color: "#174c55",
  },
  statusAccepted: {
    backgroundColor: "#d2e8da",
    color: "#184331",
  },
  statusRefused: {
    backgroundColor: "#f6d9d5",
    color: "#7a2b28",
  },
  statusIssued: {
    backgroundColor: "#f6e5c8",
    color: "#613e16",
  },
  statusPaid: {
    backgroundColor: "#d2e8da",
    color: "#184331",
  },
  bankDetails: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f2f0ed",
    borderRadius: 4,
  },
  bankTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  bankText: {
    fontSize: 9,
    color: "#4a4640",
  },
});
