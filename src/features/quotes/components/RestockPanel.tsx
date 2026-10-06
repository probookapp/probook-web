"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "@/lib/navigation";
import { PackageX, Download } from "lucide-react";
import { Badge, Button, getQuoteStatusVariant, getStatusLabel } from "@/components/ui";
import { exportToCsv } from "@/lib/csv-export";
import { useQuoteRestock } from "../hooks/useQuotes";

/**
 * The shopping list the quotes on the table add up to.
 *
 * A quote can promise goods that have run out — it commits no stock, and
 * refusing to write one would be refusing the sale. What that costs is sight of
 * the shortfall, so it is gathered here: per article, what the live quotes ask
 * for, what is on the shelf, what has to be bought, and which quotes are
 * waiting on it. Nothing shows when nothing is missing.
 */
export function RestockPanel() {
  const { t } = useTranslation(["quotes", "products", "common"]);
  const router = useRouter();
  const { data: items } = useQuoteRestock();
  const [open, setOpen] = useState(false);

  if (!items || items.length === 0) return null;

  const label = (item: (typeof items)[number]) =>
    item.variant_name ? `${item.designation} — ${item.variant_name}` : item.designation;

  const handleExport = () => {
    exportToCsv(
      items,
      [
        { header: t("quotes:restock.article"), accessor: label },
        { header: t("products:fields.reference"), accessor: (i) => i.reference ?? "" },
        { header: t("quotes:restock.missing"), accessor: (i) => i.missing },
        { header: t("quotes:restock.inStock"), accessor: (i) => i.quantity_in_stock },
        { header: t("quotes:restock.quoted"), accessor: (i) => i.quantity_quoted },
        {
          header: t("quotes:restock.quotes"),
          accessor: (i) => i.quotes.map((q) => `${q.quote_number} (${q.quantity})`).join(" "),
        },
      ],
      `restock_${new Date().toISOString().split("T")[0]}.csv`
    );
  };

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
        >
          <PackageX className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {t("quotes:restock.banner", { count: items.length })}
          </span>
          <span className="ms-auto shrink-0 text-xs text-amber-700 dark:text-amber-400">
            {open ? t("quotes:restock.hide") : t("quotes:restock.show")}
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-amber-200 dark:border-amber-800">
          {/* One block per article, so a phone reads it as a list rather than a
              table pushed sideways. */}
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-800/60">
            {items.map((item) => (
              <li
                key={`${item.product_id}-${item.variant_id ?? "root"}`}
                className="px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 font-medium text-gray-900 dark:text-gray-100">
                    {label(item)}
                    {item.reference && (
                      <span className="ms-2 text-xs text-gray-500 dark:text-gray-400">
                        {item.reference}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-red-700 dark:text-red-400">
                    {t("quotes:restock.toBuy", { count: item.missing, unit: item.unit })}
                  </span>
                </div>

                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                  {t("quotes:restock.detail", {
                    quoted: item.quantity_quoted,
                    inStock: item.quantity_in_stock,
                  })}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  {item.quotes.map((quote) => (
                    <button
                      key={quote.id}
                      onClick={() => router.push(`/quotes/${quote.id}`)}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-gray-900 dark:hover:bg-amber-900/40 lg:min-h-0"
                    >
                      <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                        {quote.quote_number}
                      </span>
                      <span className="max-w-32 truncate text-gray-600 dark:text-gray-400">
                        {quote.client_name}
                      </span>
                      <span className="tabular-nums text-gray-500 dark:text-gray-400">
                        ×{quote.quantity}
                      </span>
                      <Badge variant={getQuoteStatusVariant(quote.status)}>
                        {getStatusLabel(quote.status)}
                      </Badge>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex justify-end border-t border-amber-200 px-4 py-3 dark:border-amber-800">
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 me-2" />
              {t("common:buttons.exportCsv")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
