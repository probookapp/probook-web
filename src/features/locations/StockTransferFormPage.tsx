import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormActionBar,
  Input,
  Select,
  SearchableSelect,
  Textarea,
} from "@/components/ui";
import { productApi } from "@/lib/api";
import { useRouter } from "@/lib/navigation";
import { getApiErrorMessage } from "@/lib/api-adapter";
import { isOfflineQueuedError } from "@/lib/offline-errors";
import { toast } from "@/stores/useToastStore";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { useLocations } from "./hooks/useLocations";
import { useCreateStockTransfer } from "./hooks/useStockTransfers";

interface TransferFormLine {
  product_id: string;
  variant_id: string;
  quantity: number;
}

const emptyLine: TransferFormLine = { product_id: "", variant_id: "", quantity: 1 };

/** Where the transfer list lives: the second tab of the locations page. */
export const TRANSFERS_LIST = "/locations?tab=transfers";

/**
 * Recording a stock transfer, on a page of its own like the other documents
 * with lines. It used to be a dialog: too narrow for a product's full name, and
 * its add button sat above the lines, out of reach on a long transfer.
 */
export function StockTransferFormPage() {
  const { t } = useTranslation("locations");
  const { t: tCommon } = useTranslation("common");
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { data: locations } = useLocations();
  const createTransfer = useCreateStockTransfer();

  const { data: products } = useQuery({
    queryKey: ["products-with-details"],
    queryFn: productApi.getAllWithDetails,
  });

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferFormLine[]>([{ ...emptyLine }]);
  const [error, setError] = useState<string | undefined>();
  const submittedRef = useRef(false);

  const isDirty =
    !!fromId || !!toId || !!notes.trim() || lines.length > 1 || !!lines[0]?.product_id || lines[0]?.quantity !== 1;
  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);

  const locationOptions = useMemo(
    () => [
      { value: "", label: t("transfers.selectLocation") },
      ...(locations ?? []).map((l) => ({ value: l.id, label: l.name })),
    ],
    [locations, t]
  );

  const productOptions = useMemo(
    () =>
      // A pack has no shelf of its own: its components are bought and moved instead.
      (products ?? []).filter((p) => !p.is_bundle).map((p) => ({
        value: p.id,
        label: `${p.designation}${p.reference ? ` (${p.reference})` : ""}`,
      })),
    [products]
  );

  const getVariantOptions = (productId: string) => {
    if (!productId || !products) return [];
    const product = products.find((p) => p.id === productId);
    if (!product?.has_variants || !product.variants) return [];
    return product.variants.map((v) => ({ value: v.id, label: v.name }));
  };

  const updateLine = (index: number, patch: Partial<TransferFormLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const leave = () => blocker.guard(() => router.push(TRANSFERS_LIST));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) { showSubscribePrompt(); return; }
    setError(undefined);

    if (!fromId || !toId) {
      setError(t("transfers.validation.locationsRequired"));
      return;
    }
    if (fromId === toId) {
      setError(t("transfers.validation.sameLocation"));
      return;
    }
    const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError(t("transfers.validation.atLeastOneLine"));
      return;
    }

    try {
      const created = await createTransfer.mutateAsync({
        from_location_id: fromId,
        to_location_id: toId,
        notes: notes.trim() || undefined,
        lines: validLines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id || null,
          quantity: Number(l.quantity),
        })),
      });
      toast.success(t("transfers.messages.created"));
      submittedRef.current = true;
      router.push(`/locations/transfers/${created.id}`);
    } catch (err) {
      // Queued offline: it has no server id yet, so no page — back to the list.
      if (isOfflineQueuedError(err)) {
        toast.info(tCommon("offline.saved_offline"));
        submittedRef.current = true;
        router.push(TRANSFERS_LIST);
        return;
      }
      toast.error(getApiErrorMessage(err, t("transfers.messages.createError")));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={leave}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {tCommon("buttons.back")}
        </Button>
        <h1 className="text-2xl font-bold text-(--color-text-primary)">{t("transfers.newTransfer")}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label={t("transfers.fields.from")}
                name="from-location"
                options={locationOptions}
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              />
              <Select
                label={t("transfers.fields.to")}
                name="to-location"
                options={locationOptions}
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("transfers.fields.lines")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lines.map((line, index) => {
              const variantOptions = getVariantOptions(line.product_id);
              const hasVariants = variantOptions.length > 0;
              return (
                <div
                  key={index}
                  className="p-4 border border-(--color-border-primary) rounded-lg bg-(--color-bg-secondary)"
                >
                  <div className="flex items-start gap-2">
                    {/* From lg the product and its quantity share a row; the
                        product takes whatever width is left. */}
                    <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_8rem] gap-3">
                      <div className="min-w-0 space-y-2">
                        <SearchableSelect
                          label={t("transfers.fields.product")}
                          options={productOptions}
                          value={line.product_id}
                          onChange={(val) => updateLine(index, { product_id: val, variant_id: "" })}
                          placeholder={t("transfers.fields.selectProduct")}
                        />
                        {hasVariants && (
                          <SearchableSelect
                            label={t("transfers.fields.variant")}
                            options={variantOptions}
                            value={line.variant_id}
                            onChange={(val) => updateLine(index, { variant_id: val })}
                            placeholder={t("transfers.fields.selectVariant")}
                          />
                        )}
                      </div>
                      <Input
                        label={t("transfers.fields.quantity")}
                        type="number"
                        min="1"
                        step="1"
                        autoComplete="off"
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                        className="mt-6 -me-2 rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                        title={tCommon("buttons.delete")}
                        aria-label={tCommon("buttons.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Under the last line, where the eye already is. */}
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
            >
              <Plus className="h-4 w-4 me-1" />
              {t("transfers.fields.addLine")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("transfers.fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea autoComplete="off" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <FormActionBar>
          <Button type="button" variant="secondary" onClick={leave} className="flex-1 sm:flex-none">
            {tCommon("buttons.cancel")}
          </Button>
          <Button type="submit" isLoading={createTransfer.isPending} className="flex-1 sm:flex-none">
            {tCommon("buttons.create")}
          </Button>
        </FormActionBar>
      </form>

      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
    </div>
  );
}
