import { create } from "zustand";
import type { Product, ProductVariant, PosSession, PosRegister } from "@/types";

export interface CartItem {
  id: string; // Temporary ID for cart management
  productId: string | null;
  barcode: string | null;
  designation: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  unit: string;
  discountPercent: number;
  priceTier: string | null; // label of selected price tier, null = default price
  variantId: string | null;
  variantName: string | null;
}

interface PosState {
  // Session state
  currentSession: PosSession | null;
  currentRegister: PosRegister | null;

  // Cart state
  items: CartItem[];
  discountPercent: number;
  discountAmount: number;
  clientId: string | null;

  // Actions
  setSession: (session: PosSession | null, register: PosRegister | null) => void;
  clearSession: () => void;

  // Cart actions
  addItem: (product: Product, quantity?: number, priceTier?: string) => void;
  addItemWithVariant: (product: Product, variant: ProductVariant, quantity?: number) => void;
  addCustomItem: (designation: string, unitPrice: number, taxRate: number, quantity?: number) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateItemPrice: (itemId: string, unitPrice: number) => void;
  updateItemDiscount: (itemId: string, discountPercent: number) => void;
  setTransactionDiscount: (percent: number, amount: number) => void;
  setClient: (clientId: string | null) => void;
  clearCart: () => void;

  // Computed getters
  getSubtotal: () => number;
  getTotalVat: () => number;
  getTotal: () => number;
  getFinalAmount: () => number;
  getItemCount: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
  // Initial state
  currentSession: null,
  currentRegister: null,
  items: [],
  discountPercent: 0,
  discountAmount: 0,
  clientId: null,

  // Session actions
  setSession: (session, register) =>
    set({ currentSession: session, currentRegister: register }),

  clearSession: () =>
    set({
      currentSession: null,
      currentRegister: null,
      items: [],
      discountPercent: 0,
      discountAmount: 0,
      clientId: null,
    }),

  // Cart actions
  addItem: (product, quantity = 1, priceTier?: string) => {
    const { items } = get();
    // Determine unit price based on price tier
    let unitPrice = product.unit_price;
    if (priceTier && product.prices) {
      const tier = product.prices.find((p) => p.label === priceTier);
      if (tier) unitPrice = tier.price;
    }

    const existingItem = items.find(
      (item) => item.productId === product.id && item.priceTier === (priceTier || null)
    );

    if (existingItem) {
      set({
        items: items.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ),
      });
    } else {
      const newItem: CartItem = {
        id: crypto.randomUUID(),
        productId: product.id,
        barcode: product.barcode,
        designation: product.designation,
        quantity,
        unitPrice,
        taxRate: product.tax_rate,
        unit: product.unit ?? "unit",
        discountPercent: 0,
        priceTier: priceTier || null,
        variantId: null,
        variantName: null,
      };
      set({ items: [...items, newItem] });
    }
  },

  addItemWithVariant: (product, variant, quantity = 1) => {
    const { items } = get();
    const unitPrice = variant.price_override ?? product.unit_price;
    const existingItem = items.find(
      (item) => item.productId === product.id && item.variantId === variant.id
    );

    if (existingItem) {
      set({
        items: items.map((item) =>
          item.id === existingItem.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        ),
      });
    } else {
      const newItem: CartItem = {
        id: crypto.randomUUID(),
        productId: product.id,
        barcode: variant.barcode || product.barcode,
        designation: `${product.designation} — ${variant.name}`,
        quantity,
        unitPrice,
        taxRate: product.tax_rate,
        unit: product.unit ?? "unit",
        discountPercent: 0,
        priceTier: null,
        variantId: variant.id,
        variantName: variant.name,
      };
      set({ items: [...items, newItem] });
    }
  },

  addCustomItem: (designation, unitPrice, taxRate, quantity = 1) => {
    const newItem: CartItem = {
      id: crypto.randomUUID(),
      productId: null,
      barcode: null,
      designation,
      quantity,
      unitPrice,
      taxRate,
      unit: "unit",
      discountPercent: 0,
      priceTier: null,
      variantId: null,
      variantName: null,
    };
    set((state) => ({ items: [...state.items, newItem] }));
  },

  removeItem: (itemId) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== itemId),
    })),

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, quantity } : item
      ),
    }));
  },

  updateItemPrice: (itemId, unitPrice) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, unitPrice } : item
      ),
    })),

  updateItemDiscount: (itemId, discountPercent) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId ? { ...item, discountPercent } : item
      ),
    })),

  setTransactionDiscount: (percent, amount) =>
    set({ discountPercent: percent, discountAmount: amount }),

  setClient: (clientId) => set({ clientId }),

  clearCart: () =>
    set({
      items: [],
      discountPercent: 0,
      discountAmount: 0,
      clientId: null,
    }),

  // Computed getters
  getSubtotal: () => {
    const { items } = get();
    return items.reduce((total, item) => {
      const baseHt = item.quantity * item.unitPrice;
      const discountedHt = baseHt * (1 - item.discountPercent / 100);
      return total + discountedHt;
    }, 0);
  },

  getTotalVat: () => {
    const { items } = get();
    return items.reduce((total, item) => {
      const baseHt = item.quantity * item.unitPrice;
      const discountedHt = baseHt * (1 - item.discountPercent / 100);
      const vat = discountedHt * (item.taxRate / 100);
      return total + vat;
    }, 0);
  },

  getTotal: () => {
    return get().getSubtotal() + get().getTotalVat();
  },

  getFinalAmount: () => {
    const { discountPercent, discountAmount } = get();
    const total = get().getTotal();
    return total * (1 - discountPercent / 100) - discountAmount;
  },

  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0);
  },
}));
