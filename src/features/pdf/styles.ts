import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 60,
    objectFit: "contain",
  },
  companyInfo: {
    textAlign: "right",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 9,
    color: "#666",
    marginBottom: 2,
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2563eb",
    marginBottom: 20,
  },
  documentInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  infoBlock: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 8,
    color: "#666",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 10,
    marginBottom: 8,
  },
  clientBox: {
    backgroundColor: "#f3f4f6",
    padding: 15,
    borderRadius: 4,
  },
  clientName: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
  },
  clientDetail: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 2,
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2563eb",
    color: "#fff",
    padding: 8,
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    padding: 8,
    fontSize: 9,
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
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
    marginTop: 20,
  },
  totalsBox: {
    width: 200,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  totalLabel: {
    fontSize: 10,
    color: "#374151",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    backgroundColor: "#2563eb",
    color: "#fff",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  totalLabelFinal: {
    fontSize: 12,
    fontWeight: "bold",
  },
  totalValueFinal: {
    fontSize: 12,
    fontWeight: "bold",
  },
  notes: {
    marginTop: 30,
    padding: 15,
    backgroundColor: "#fef3c7",
    borderRadius: 4,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: "#92400e",
  },
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
  footerText: {
    marginBottom: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
  statusDraft: {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  },
  statusSent: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8",
  },
  statusAccepted: {
    backgroundColor: "#d1fae5",
    color: "#065f46",
  },
  statusIssued: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  statusPaid: {
    backgroundColor: "#d1fae5",
    color: "#065f46",
  },
  bankDetails: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
  },
  bankTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  bankText: {
    fontSize: 9,
    color: "#374151",
  },
});
