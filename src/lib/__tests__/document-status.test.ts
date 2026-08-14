import { describe, it, expect } from "vitest";
import {
  parseStatusFilter,
  filterByStatus,
  INVOICE_STATUSES,
  QUOTE_STATUSES,
} from "../document-status";

describe("parseStatusFilter", () => {
  it("returns no filter when nothing was asked for", () => {
    expect(parseStatusFilter(null, INVOICE_STATUSES)).toEqual({});
    expect(parseStatusFilter("", INVOICE_STATUSES)).toEqual({});
    expect(parseStatusFilter("ALL", INVOICE_STATUSES)).toEqual({});
  });

  it("keeps a single state", () => {
    expect(parseStatusFilter("PAID", INVOICE_STATUSES)).toEqual({ status: { in: ["PAID"] } });
  });

  it("keeps a set, whatever the spacing or case", () => {
    expect(parseStatusFilter(" draft , ISSUED ", INVOICE_STATUSES)).toEqual({
      status: { in: ["DRAFT", "ISSUED"] },
    });
  });

  it("drops states that belong to another document type", () => {
    // A quote is never PAID; asking for it must not widen the invoice list.
    expect(parseStatusFilter("PAID,SENT", QUOTE_STATUSES)).toEqual({ status: { in: ["SENT"] } });
  });

  it("matches nothing rather than everything when every state is unknown", () => {
    // A stale bookmark must not silently return an unfiltered list that looks
    // filtered.
    expect(parseStatusFilter("NONSENSE", INVOICE_STATUSES)).toEqual({ status: { in: [] } });
  });
});

describe("filterByStatus", () => {
  const rows = [
    { id: "1", status: "DRAFT" },
    { id: "2", status: "ISSUED" },
    { id: "3", status: "PAID" },
  ];

  it("passes everything through when unfiltered", () => {
    expect(filterByStatus(rows)).toHaveLength(3);
    expect(filterByStatus(rows, "ALL")).toHaveLength(3);
    expect(filterByStatus(rows, null)).toHaveLength(3);
  });

  it("keeps only the requested states", () => {
    expect(filterByStatus(rows, "PAID").map((r) => r.id)).toEqual(["3"]);
    expect(filterByStatus(rows, "DRAFT,PAID").map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("agrees with the server-side filter on the same input", () => {
    // The demo lists never hit the API; if these two disagreed, the chips would
    // behave differently for a prospect than for a customer.
    const server = parseStatusFilter("DRAFT,PAID", INVOICE_STATUSES);
    const kept = "status" in server ? server.status.in : [];
    expect(filterByStatus(rows, "DRAFT,PAID").map((r) => r.status).sort()).toEqual(
      [...kept].sort()
    );
  });
});
