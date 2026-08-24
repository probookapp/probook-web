import { describe, it, expect } from "vitest";
import {
  resolveHeader,
  getColumnsForEntity,
  getLocalizedHeaders,
  productColumns,
  clientColumns,
  supplierColumns,
} from "../import-columns";

// ─── resolveHeader ─────────────────────────────────────────────────────────

describe("resolveHeader", () => {
  it("resolves English product header to internal key", () => {
    expect(resolveHeader("Product Name")).toBe("designation");
  });

  it("resolves French product header to internal key", () => {
    expect(resolveHeader("Nom du produit")).toBe("designation");
  });

  it("resolves Arabic product header to internal key", () => {
    expect(resolveHeader("اسم المنتج")).toBe("designation");
  });

  it("resolves internal key to itself", () => {
    expect(resolveHeader("designation")).toBe("designation");
    expect(resolveHeader("unit_price")).toBe("unit_price");
  });

  it("is case-insensitive", () => {
    expect(resolveHeader("PRODUCT NAME")).toBe("designation");
    expect(resolveHeader("email")).toBe("email");
    expect(resolveHeader("EMAIL")).toBe("email");
  });

  it("trims whitespace", () => {
    expect(resolveHeader("  Product Name  ")).toBe("designation");
  });

  it("returns undefined for unknown headers", () => {
    expect(resolveHeader("unknown_column")).toBeUndefined();
    expect(resolveHeader("foobar")).toBeUndefined();
  });

  it("resolves client headers", () => {
    expect(resolveHeader("Client Name")).toBe("name");
    expect(resolveHeader("Nom du client")).toBe("name");
    expect(resolveHeader("اسم العميل")).toBe("name");
  });

  it("resolves supplier headers", () => {
    expect(resolveHeader("Supplier Name")).toBe("name");
    expect(resolveHeader("Nom du fournisseur")).toBe("name");
    expect(resolveHeader("اسم المورد")).toBe("name");
  });

  it("resolves all product column keys", () => {
    const expectedKeys = ["designation", "unit_price", "description", "tax_rate", "unit", "reference", "barcode", "is_service", "quantity", "purchase_price"];
    for (const key of expectedKeys) {
      expect(resolveHeader(key)).toBe(key);
    }
  });
});

// ─── getColumnsForEntity ───────────────────────────────────────────────────

describe("getColumnsForEntity", () => {
  // Content, not identity: the accessor filters the identifier columns by
  // regime, so it returns a new array rather than the module's own.
  it("returns product columns", () => {
    expect(getColumnsForEntity("products")).toEqual(productColumns);
  });

  it("returns client columns", () => {
    expect(getColumnsForEntity("clients")).toEqual(clientColumns);
  });

  it("returns supplier columns", () => {
    expect(getColumnsForEntity("suppliers")).toEqual(supplierColumns);
  });

  it("offers only the identifiers the fiscal regime uses", () => {
    const keys = (profile: string) =>
      getColumnsForEntity("clients", profile).map((c) => c.key);

    // Algeria: NIF, registre de commerce, NIS and article d'imposition.
    expect(keys("DZ")).toEqual(expect.arrayContaining(["vat_number", "siret", "nis", "art"]));

    // France: SIRET and VAT number. NIS and "article d'imposition" name nothing
    // there, and two meaningless columns in a template are two invitations to
    // fill them in wrongly.
    expect(keys("FR")).toEqual(expect.arrayContaining(["siret", "vat_number"]));
    expect(keys("FR")).not.toContain("nis");
    expect(keys("FR")).not.toContain("art");

    // Everything that is not an identifier is the same trade either way.
    expect(keys("FR").filter((k) => !["nis", "art"].includes(k))).toEqual(
      keys("DZ").filter((k) => !["nis", "art"].includes(k))
    );
  });

  it("product columns have designation as required", () => {
    const cols = getColumnsForEntity("products");
    const designation = cols.find((c) => c.key === "designation");
    expect(designation).toBeDefined();
    expect(designation!.required).toBe(true);
  });

  it("client columns have name as required", () => {
    const cols = getColumnsForEntity("clients");
    const name = cols.find((c) => c.key === "name");
    expect(name).toBeDefined();
    expect(name!.required).toBe(true);
  });

  it("supplier columns have name as required", () => {
    const cols = getColumnsForEntity("suppliers");
    const name = cols.find((c) => c.key === "name");
    expect(name).toBeDefined();
    expect(name!.required).toBe(true);
  });

  it("all columns have labels for en, fr, ar", () => {
    for (const entityType of ["products", "clients", "suppliers"] as const) {
      const cols = getColumnsForEntity(entityType);
      for (const col of cols) {
        expect(col.labels.en).toBeTruthy();
        expect(col.labels.fr).toBeTruthy();
        expect(col.labels.ar).toBeTruthy();
      }
    }
  });
});

// ─── getLocalizedHeaders ───────────────────────────────────────────────────

describe("getLocalizedHeaders", () => {
  it("returns English headers for products", () => {
    const headers = getLocalizedHeaders("products", "en");
    expect(headers).toContain("Product Name");
    expect(headers).toContain("Selling Price excl. Tax");
  });

  it("returns French headers for products", () => {
    const headers = getLocalizedHeaders("products", "fr");
    expect(headers).toContain("Nom du produit");
    expect(headers).toContain("Prix de vente HT");
  });

  it("returns Arabic headers for clients", () => {
    const headers = getLocalizedHeaders("clients", "ar");
    expect(headers).toContain("اسم العميل");
  });

  it("falls back to English for unknown locale", () => {
    const headers = getLocalizedHeaders("suppliers", "de");
    expect(headers).toContain("Supplier Name");
  });

  it("handles locale with region code", () => {
    const headers = getLocalizedHeaders("products", "fr-FR");
    expect(headers).toContain("Nom du produit");
  });

  it("handles ar-SA locale", () => {
    const headers = getLocalizedHeaders("clients", "ar-SA");
    expect(headers).toContain("اسم العميل");
  });

  it("returns correct number of headers matching columns", () => {
    for (const entityType of ["products", "clients", "suppliers"] as const) {
      const cols = getColumnsForEntity(entityType);
      const headers = getLocalizedHeaders(entityType, "en");
      expect(headers.length).toBe(cols.length);
    }
  });
});
