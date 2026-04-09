import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { productApi } from "@/lib/api";
import { useProductPhoto } from "@/features/products/hooks/useProducts";
import { useProductCategories } from "@/features/products/hooks/useProductCategories";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_PRODUCTS } from "@/lib/demo-data";
import { Modal } from "@/components/ui";
import type { Product, ProductVariant } from "@/types";
import { VariantPickerModal } from "./VariantPickerModal";
import { formatCurrency } from "@/lib/utils";

const formatAmount = formatCurrency;

function ProductTile({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) {
  const { t } = useTranslation("pos");
  const { data: photoBase64 } = useProductPhoto(product.id);

  return (
    <button
      onClick={onClick}
      className="text-left border border-(--color-border-primary) rounded-lg hover:bg-(--color-bg-secondary) transition-colors overflow-hidden flex flex-col"
    >
      {photoBase64 ? (
        <img
          src={photoBase64}
          alt={product.designation}
          className="w-full h-24 object-cover"
        />
      ) : (
        <div className="w-full h-24 bg-(--color-bg-tertiary) flex items-center justify-center">
          <Package className="h-8 w-8 text-(--color-text-secondary) opacity-40" />
        </div>
      )}
      <div className="p-2">
        <p className="font-medium text-sm truncate">{product.designation}</p>
        <div className="flex justify-between items-center mt-0.5">
          <span className="text-xs text-(--color-text-secondary) truncate">
            {product.reference || product.barcode || "-"}
          </span>
          <span className="font-bold text-sm text-primary-600 shrink-0 ml-1">
            {formatAmount(product.unit_price * (1 + product.tax_rate / 100))}
          </span>
        </div>
        {product.quantity !== null &&
          product.quantity <= 5 &&
          !product.is_service && (
            <p
              className={`text-xs mt-0.5 ${product.quantity === 0 ? "text-red-600 dark:text-red-400" : "text-orange-500 dark:text-orange-400"}`}
            >
              {product.quantity === 0
                ? t("outOfStock")
                : t("lowStock", { count: product.quantity })}
            </p>
          )}
      </div>
    </button>
  );
}

interface PriceTierPickerProps {
  product: Product;
  onSelect: (product: Product, priceTier?: string) => void;
  onClose: () => void;
}

function PriceTierPicker({ product, onSelect, onClose }: PriceTierPickerProps) {
  const { t } = useTranslation(["pos", "products"]);
  const prices = product.prices || [];

  return (
    <Modal isOpen={true} onClose={onClose} title={t("pos:selectPriceTier")} size="sm">
      <p className="font-medium text-sm mb-3 truncate">{product.designation}</p>
      <div className="space-y-2">
        <button
          onClick={() => onSelect(product)}
          className="w-full text-left px-3 py-2 rounded-lg border border-(--color-border-primary) hover:bg-(--color-bg-secondary) transition-colors flex justify-between items-center"
        >
          <span className="text-sm font-medium">{t("pos:defaultPrice")}</span>
          <span className="text-sm font-bold text-primary-600">{formatAmount(product.unit_price * (1 + product.tax_rate / 100))}</span>
        </button>
        {prices.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(product, p.label)}
            className="w-full text-left px-3 py-2 rounded-lg border border-(--color-border-primary) hover:bg-(--color-bg-secondary) transition-colors flex justify-between items-center"
          >
            <span className="text-sm font-medium">
              {t(`products:pricing.labels.${p.label}`, { defaultValue: p.label })}
            </span>
            <span className="text-sm font-bold text-primary-600">{formatAmount(p.price * (1 + product.tax_rate / 100))}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

interface ProductSearchProps {
  onProductSelect: (product: Product, priceTier?: string) => void;
  onVariantSelect?: (product: Product, variant: ProductVariant) => void;
}

export function ProductSearch({ onProductSelect, onVariantSelect }: ProductSearchProps) {
  const { t } = useTranslation("pos");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [priceTierProduct, setPriceTierProduct] = useState<Product | null>(null);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  const { isDemoMode } = useDemoMode();
  const { data: products } = useQuery({
    queryKey: ["pos-products", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_PRODUCTS : productApi.getAllWithDetails,
    staleTime: isDemoMode ? Infinity : undefined,
  });

  const { data: categories } = useProductCategories();

  const filteredProducts = useMemo(() => {
    if (!products) return [];

    let result = products;

    if (selectedCategory) {
      result = result.filter((p) => p.category_id === selectedCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.designation.toLowerCase().includes(term) ||
          p.reference?.toLowerCase().includes(term) ||
          p.barcode?.toLowerCase().includes(term)
      );
    }

    return result.slice(0, 20);
  }, [products, searchTerm, selectedCategory]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-4 border-b border-(--color-border-primary)">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--color-text-secondary)" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("searchProducts")}
            className="w-full pl-10 pr-4 py-3 border border-(--color-border-input) rounded-lg bg-(--color-bg-input) focus:outline-none focus:ring-2 focus:ring-primary-500"
            data-barcode-input="true"
          />
        </div>
      </div>

      {/* Category chips */}
      {categories && categories.length > 0 && (
        <div className="px-4 py-2 border-b border-(--color-border-primary) flex gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === null
                ? "bg-primary-600 text-white"
                : "bg-(--color-bg-tertiary) text-(--color-text-secondary) hover:bg-(--color-bg-secondary)"
            }`}
          >
            {t("allCategories")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? "bg-primary-600 text-white"
                  : "bg-(--color-bg-tertiary) text-(--color-text-secondary) hover:bg-(--color-bg-secondary)"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          {filteredProducts.map((product) => (
            <ProductTile
              key={product.id}
              product={product}
              onClick={() => {
                if (product.has_variants && product.variants && product.variants.length > 0) {
                  setVariantProduct(product);
                } else if (product.prices && product.prices.length > 0) {
                  setPriceTierProduct(product);
                } else {
                  onProductSelect(product);
                }
              }}
            />
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center text-(--color-text-secondary) py-8">
            {searchTerm ? t("noProductsFound") : t("noProducts")}
          </div>
        )}
      </div>

      {priceTierProduct && (
        <PriceTierPicker
          product={priceTierProduct}
          onSelect={(product, priceTier) => {
            onProductSelect(product, priceTier);
            setPriceTierProduct(null);
          }}
          onClose={() => setPriceTierProduct(null)}
        />
      )}

      {variantProduct && onVariantSelect && (
        <VariantPickerModal
          product={variantProduct}
          onSelect={(product, variant) => {
            onVariantSelect(product, variant);
            setVariantProduct(null);
          }}
          onClose={() => setVariantProduct(null)}
        />
      )}
    </div>
  );
}
