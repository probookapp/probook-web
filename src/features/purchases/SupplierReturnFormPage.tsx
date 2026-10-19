import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormActionBar,
  Input,
  SearchableSelect,
  Select,
  Textarea,
} from "@/components/ui";
import { supplierApi, productApi, locationsApi, purchaseApi } from "@/lib/api";
import { isApiError } from "@/lib/api-adapter";
import { useRouter } from "@/lib/navigation";
import { formatCurrency, formatDateISO } from "@/lib/utils";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { usePurchase } from "./hooks/usePurchases";
import { useCreateSupplierReturn, useOrderReturns } from "./hooks/useSupplierReturns";
import type { CreateSupplierReturnInput } from "@/types";

interface FreeLine {
  key: number;
  product_id: string;
  variant_id: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

const RECEIVED_STATUSES = ["CONFIRMED", "PARTIALLY_RECEIVED"];

const EMPTY_LINE: Omit<FreeLine, "key"> = {
  product_id: "",
  variant_id: "",
  quantity: "1",
  unit_price: "0",
  tax_rate: "0",
};

/**
 * Sending goods back to a supplier who keeps their value as credit.
 *
 * Two ways in. From a received order: its lines are listed with what can still
 * go back, priced as bought. Without an order (goods bought before the app, or
 * never entered): products picked freely, as on a purchase order.
 */
export function SupplierReturnFormPage() {
  const { t } = useTranslation("purchases");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const createReturn = useCreateSupplierReturn();

  const [supplierId, setSupplierId] = useState(searchParams.get("supplier") ?? "");
  const [orderId, setOrderId] = useState(searchParams.get("order") ?? "");
  const [returnDate, setReturnDate] = useState(formatDateISO(new Date()));
  /** null = follow the order: goods leave from where they were received. */
  const [locationChoice, setLocationChoice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  /** Order mode: quantity typed per order line id. */
  const [orderQty, setOrderQty] = useState<Record<string, string>>({});
  const nextKey = useRef(1);
  const [freeLines, setFreeLines] = useState<FreeLine[]>([{ key: 0, ...EMPTY_LINE }]);
  const [touched, setTouched] = useState(false);
  const submittedRef = useRef(false);
  const blocker = useUnsavedChangesGuard(() => touched && !submittedRef.current);
  const touch = () => setTouched(true);

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: supplierApi.getAll });
  const { data: products } = useQuery({
    queryKey: ["products-with-details"],
    queryFn: productApi.getAllWithDetails,
  });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: locationsApi.getAll });
  const showLocationPicker = (locations?.length ?? 0) >= 2;

  const { data: supplierOrders } = useQuery({
    queryKey: ["purchases", "supplier", supplierId],
    queryFn: () => purchaseApi.getForSupplier(supplierId),
    enabled: !!supplierId && !isDemoMode,
  });
  const receivedOrders = useMemo(
    () => (supplierOrders?.data ?? []).filter((o) => RECEIVED_STATUSES.includes(o.status)),
    [supplierOrders]
  );

  const { data: order } = usePurchase(orderId);
  const { data: orderReturns } = useOrderReturns(orderId || null);

  const locationId = locationChoice ?? (orderId ? order?.location_id ?? "" : "");

  const alreadyReturned = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of orderReturns ?? []) {
      for (const l of r.lines ?? []) {
        if (l.purchase_order_line_id) {
          map.set(l.purchase_order_line_id, (map.get(l.purchase_order_line_id) ?? 0) + l.quantity);
        }
      }
    }
    return map;
  }, [orderReturns]);

  const orderLines = useMemo(
    () =>
      (order?.lines ?? []).map((l) => {
        const returned = alreadyReturned.get(l.id) ?? 0;
        return { line: l, returned, returnable: Math.max(0, (l.received_quantity ?? 0) - returned) };
      }),
    [order, alreadyReturned]
  );

  const productOptions = useMemo(
    () =>
      (products ?? [])
        .filter((p) => !p.is_bundle && !p.is_service)
        .map((p) => ({ value: p.id, label: `${p.designation}${p.reference ? ` (${p.reference})` : ""}` })),
    [products]
  );
  const supplierOptions = useMemo(
    () => (suppliers ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const lineLabel = (l: (typeof orderLines)[number]["line"]) =>
    `${l.product?.designation ?? l.variant?.name ?? t("fields.product")}${
      l.variant?.name && l.product?.designation ? ` — ${l.variant.name}` : ""
    }`;

  /** The lines to send, whichever mode, with their amounts. */
  const lines: CreateSupplierReturnInput["lines"] = useMemo(() => {
    if (orderId) {
      return orderLines
        .map(({ line }) => ({
          product_id: line.product_id,
          variant_id: line.variant_id,
          purchase_order_line_id: line.id,
          quantity: Number(orderQty[line.id]) || 0,
          unit_price: line.unit_price,
          tax_rate: line.tax_rate,
        }))
        .filter((l) => l.quantity > 0);
    }
    return freeLines
      .filter((l) => l.product_id && Number(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id || null,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price) || 0,
        tax_rate: Number(l.tax_rate) || 0,
      }));
  }, [orderId, orderLines, orderQty, freeLines]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const s = l.quantity * l.unit_price;
      subtotal += s;
      tax += s * (l.tax_rate / 100);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines]);

  const overReturned = orderId
    ? orderLines.some(({ line, returnable }) => (Number(orderQty[line.id]) || 0) > returnable)
    : false;

  const updateFree = (key: number, patch: Partial<FreeLine>) => {
    touch();
    setFreeLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const pickProduct = (key: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    updateFree(key, {
      product_id: productId,
      variant_id: "",
      unit_price: String(product?.purchase_price ?? 0),
      tax_rate: String(product?.tax_rate ?? 0),
    });
  };

  const variantOptions = (productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (!product?.has_variants || !product.variants) return [];
    return product.variants.map((v) => ({ value: v.id, label: v.name }));
  };

  const back = () => blocker.guard(() => router.push(orderId ? `/purchases/${orderId}` : "/purchases/returns"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (!supplierId) { toast.error(t("validation.supplierRequired")); return; }
    if (lines.length === 0) { toast.error(t("validation.atLeastOneLine")); return; }
    if (!orderId && freeLines.some((l) => l.product_id && variantOptions(l.product_id).length > 0 && !l.variant_id)) {
      toast.error(t("validation.productRequired"));
      return;
    }
    if (overReturned) { toast.error(t("returns.errors.OVER_RECEIVED")); return; }
    try {
      const created = await createReturn.mutateAsync({
        supplier_id: supplierId,
        purchase_order_id: orderId || null,
        location_id: showLocationPicker ? locationId || null : null,
        return_date: returnDate,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        lines,
      });
      submittedRef.current = true;
      router.push(`/purchases/returns/${created.id}`);
    } catch (err) {
      let code: string | undefined;
      if (isApiError(err)) {
        try {
          code = (JSON.parse(err.body) as { code?: string }).code;
        } catch {
          code = undefined;
        }
      }
      toast.error(
        code && ["INSUFFICIENT_STOCK", "OVER_RECEIVED", "NOT_STOCKED"].includes(code)
          ? t(`returns.errors.${code}`)
          : tCommon("messages.error")
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {tCommon("buttons.back")}
        </Button>
        <h1 className="text-2xl font-bold text-(--color-text-primary)">{t("returns.newReturn")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchableSelect
                label={t("fields.supplier") + " *"}
                options={supplierOptions}
                value={supplierId}
                onChange={(val) => {
                  touch();
                  setSupplierId(val);
                  setOrderId("");
                  setOrderQty({});
                }}
                placeholder={t("fields.selectSupplier")}
              />
              <Input
                label={t("returns.date") + " *"}
                name="return-date"
                type="date"
                value={returnDate}
                onChange={(e) => { touch(); setReturnDate(e.target.value); }}
                required
                autoComplete="off"
              />
              <Select
                label={t("returns.fromOrder")}
                name="return-order"
                value={orderId}
                disabled={!supplierId}
                onChange={(e) => {
                  touch();
                  setOrderId(e.target.value);
                  setOrderQty({});
                  setLocationChoice(null);
                }}
                options={[
                  { value: "", label: t("returns.noOrder") },
                  ...receivedOrders.map((o) => ({ value: o.id, label: o.order_number })),
                  // An order given in the address but not in the loaded page.
                  ...(order && !receivedOrders.some((o) => o.id === order.id)
                    ? [{ value: order.id, label: order.order_number }]
                    : []),
                ]}
              />
              {showLocationPicker && (
                <Select
                  label={t("returns.location")}
                  name="return-location"
                  value={locationId}
                  onChange={(e) => { touch(); setLocationChoice(e.target.value); }}
                  options={[
                    { value: "", label: t("fields.defaultLocation") },
                    ...(locations ?? []).map((l) => ({ value: l.id, label: l.name })),
                  ]}
                />
              )}
            </div>
            <Input
              label={t("returns.reason")}
              name="return-reason"
              value={reason}
              onChange={(e) => { touch(); setReason(e.target.value); }}
              placeholder={t("returns.reasonPlaceholder")}
              autoComplete="off"
            />
            <p className="flex items-start gap-2 text-sm text-(--color-text-secondary)">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t("returns.creditHint")}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("returns.lines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderId ? (
              orderLines.length > 0 && orderLines.every((l) => l.returnable <= 0) ? (
                <p className="text-sm text-(--color-text-secondary)">{t("returns.nothingToReturn")}</p>
              ) : (
                <div className="divide-y divide-(--color-border-primary) rounded-lg border border-(--color-border-primary)">
                  {orderLines.map(({ line, returned, returnable }) => {
                    const qty = Number(orderQty[line.id]) || 0;
                    const over = qty > returnable;
                    return (
                      <div key={line.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-(--color-text-primary) wrap-anywhere">{lineLabel(line)}</p>
                          <p className="text-xs text-(--color-text-secondary)">
                            {t("returns.returnable", { received: line.received_quantity, returned })}
                            {" · "}
                            {formatCurrency(line.unit_price)} · {line.tax_rate} %
                          </p>
                        </div>
                        <div className="w-full sm:w-32">
                          <Input
                            label={t("returns.returnQty")}
                            name={`return-qty-${line.id}`}
                            type="number"
                            min="0"
                            max={returnable}
                            step="1"
                            value={orderQty[line.id] ?? ""}
                            disabled={returnable <= 0}
                            onChange={(e) => {
                              touch();
                              setOrderQty((prev) => ({ ...prev, [line.id]: e.target.value }));
                            }}
                            error={over ? t("returns.errors.OVER_RECEIVED") : undefined}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <>
                {freeLines.map((line) => {
                  const variants = variantOptions(line.product_id);
                  return (
                    <div
                      key={line.key}
                      className="p-4 border border-(--color-border-primary) rounded-lg bg-(--color-bg-secondary)"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0 grid grid-cols-3 lg:grid-cols-[minmax(0,1fr)_6rem_9rem_6rem] gap-3">
                          <div className="col-span-3 lg:col-span-1 min-w-0 space-y-2">
                            <SearchableSelect
                              label={t("fields.product") + " *"}
                              options={productOptions}
                              value={line.product_id}
                              onChange={(val) => pickProduct(line.key, val)}
                              placeholder={t("fields.selectProduct")}
                            />
                            {variants.length > 0 && (
                              <SearchableSelect
                                label={t("fields.variant") + " *"}
                                options={variants}
                                value={line.variant_id}
                                onChange={(val) => updateFree(line.key, { variant_id: val })}
                                placeholder={t("fields.selectVariant")}
                              />
                            )}
                          </div>
                          <Input
                            label={t("fields.quantity") + " *"}
                            name={`return-free-qty-${line.key}`}
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) => updateFree(line.key, { quantity: e.target.value })}
                            autoComplete="off"
                          />
                          <Input
                            label={t("fields.unitPrice") + " *"}
                            name={`return-free-price-${line.key}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateFree(line.key, { unit_price: e.target.value })}
                            autoComplete="off"
                          />
                          <Input
                            label={t("fields.taxRate")}
                            name={`return-free-tax-${line.key}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={line.tax_rate}
                            onChange={(e) => updateFree(line.key, { tax_rate: e.target.value })}
                            autoComplete="off"
                          />
                        </div>
                        {freeLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => { touch(); setFreeLines((prev) => prev.filter((l) => l.key !== line.key)); }}
                            aria-label={tCommon("buttons.delete")}
                            title={tCommon("buttons.delete")}
                            className="mt-6 -me-2 rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    touch();
                    const key = nextKey.current++;
                    setFreeLines((prev) => [...prev, { key, ...EMPTY_LINE }]);
                  }}
                >
                  <Plus className="h-4 w-4 me-1" />
                  {t("fields.addLine")}
                </Button>
              </>
            )}

            <div className="border-t border-(--color-border-primary) pt-4 space-y-1 text-sm sm:ms-auto sm:max-w-xs">
              <div className="flex justify-between text-(--color-text-secondary)">
                <span>{t("fields.subtotal")}</span>
                <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-(--color-text-secondary)">
                <span>{t("fields.tax")}</span>
                <span className="tabular-nums">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="flex justify-between font-medium text-(--color-text-primary) text-base">
                <span>{t("fields.total")}</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="return-notes"
              rows={3}
              value={notes}
              onChange={(e) => { touch(); setNotes(e.target.value); }}
              autoComplete="off"
            />
          </CardContent>
        </Card>

        <FormActionBar>
          <Button type="button" variant="secondary" onClick={back} className="flex-1 sm:flex-none">
            {tCommon("buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createReturn.isPending}
            disabled={!supplierId || lines.length === 0 || overReturned}
            className="flex-1 sm:flex-none"
          >
            {tCommon("buttons.create")}
          </Button>
        </FormActionBar>
      </form>

      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
    </div>
  );
}
