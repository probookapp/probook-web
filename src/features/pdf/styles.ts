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
    color: "#635e56",
    marginBottom: 2,
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1c5f68",
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
    color: "#635e56",
    marginBottom: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 10,
    marginBottom: 8,
  },
  clientBox: {
    backgroundColor: "#f2f0ed",
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
    color: "#4a4640",
    marginBottom: 2,
  },
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1c5f68",
    color: "#fff",
    padding: 8,
    fontWeight: "bold",
    fontSize: 9,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e2dc",
    padding: 8,
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
    borderBottomColor: "#e5e2dc",
  },
  totalLabel: {
    fontSize: 10,
    color: "#4a4640",
    flexShrink: 1,
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
    paddingVertical: 8,
    backgroundColor: "#1c5f68",
    color: "#fff",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  totalLabelFinal: {
    fontSize: 12,
    fontWeight: "bold",
    flexShrink: 1,
    paddingRight: 8,
  },
  totalValueFinal: {
    fontSize: 12,
    fontWeight: "bold",
    flexShrink: 0,
  },
  notes: {
    marginTop: 30,
    padding: 15,
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
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#a8a299",
    borderTopWidth: 1,
    borderTopColor: "#e5e2dc",
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
  statusIssued: {
    backgroundColor: "#f6e5c8",
    color: "#613e16",
  },
  statusPaid: {
    backgroundColor: "#d2e8da",
    color: "#184331",
  },
  bankDetails: {
    marginTop: 20,
    padding: 10,
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
