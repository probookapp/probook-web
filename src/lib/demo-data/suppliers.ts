import type { Supplier } from "@/types";

const now = "2026-03-20T10:00:00.000Z";

export const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: "demo-supplier-001",
    name: "TechnoPlus Distribution",
    email: "orders@technoplus-demo.example",
    phone: "+213 555 9001",
    address: "Zone Industrielle, Lot 12, Rouiba",
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-supplier-002",
    name: "Papeterie du Maghreb",
    email: "contact@papeterie-demo.example",
    phone: "+213 555 9002",
    address: "22 Rue Didouche Mourad, Alger",
    notes: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-supplier-003",
    name: "MobilierPro Algérie",
    email: "ventes@mobilierpro-demo.example",
    phone: "+213 555 9003",
    address: "Route Nationale 5, Blida",
    notes: null,
    created_at: now,
    updated_at: now,
  },
];
