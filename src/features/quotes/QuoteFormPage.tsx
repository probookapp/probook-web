import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useForm, useFieldArray, useWatch, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, ArrowLeft, FileText, List, Rows3 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SearchableSelect,
} from "@/components/ui";
import { RichTextEditor } from "@/components/ui/RichTextEditorLazy";
import { useQuote, useCreateQuote, useUpdateQuote } from "./hooks/useQuotes";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useClients } from "@/features/clients";
import { useProducts } from "@/features/products";
import { formatCurrency, formatDateISO, calculateLineTotal } from "@/lib/utils";
import type { QuoteStatus } from "@/types";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import { useDocumentTotals } from "@/hooks/useDocumentTotals";
import { useLocalPreference } from "@/hooks/useLocalPreference";
import { useIsNarrow } from "@/hooks/useIsNarrow";
import { DocumentLinesMobile } from "@/components/documents/DocumentLinesMobile";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";
import { toast } from "@/stores/useToastStore";
import { isOfflineQueuedError } from "@/lib/offline-errors";
import { getApiErrorMessage } from "@/lib/api-adapter";

const createLineSchema = (t: (key: string) => string) => z.object({
  product_id: z.string().nullable().optional(),
  description: z.string().min(1, t("validation:quote.lineDescriptionRequired")),
  description_html: z.string().nullable().optional(),
  quantity: z.coerce.number().min(0.01, t("validation:quote.lineQuantityPositive")),
  unit_price: z.coerce.number().min(0, t("validation:quote.linePricePositive")),
  tax_rate: z.coerce.number().min(0).max(100),
  group_name: z.string().nullable().optional(),
  is_subtotal_line: z.boolean().optional(),
});

const createQuoteFormSchema = (t: (key: string) => string) => z.object({
  client_id: z.string().min(1, t("validation:quote.clientRequired")),
  issue_date: z.string().min(1, t("validation:quote.issueDateRequired")),
  validity_date: z.string().min(1, t("validation:quote.validityDateRequired")),
  notes: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "EXPIRED"]).optional(),
  shipping_cost: z.coerce.number().min(0).optional(),
  shipping_tax_rate: z.coerce.number().min(0).max(100).optional(),
  down_payment_percent: z.coerce.number().min(0).max(100).optional(),
  down_payment_amount: z.coerce.number().min(0).optional(),
  discount_percent: z.coerce.number().min(0).max(100).optional(),
  discount_amount: z.coerce.number().min(0).optional(),
  lines: z.array(createLineSchema(t)).min(1, t("validation:quote.linesRequired")),
});

type QuoteFormData = z.output<ReturnType<typeof createQuoteFormSchema>>;

export function QuoteFormPage() {
  const { t } = useTranslation(["quotes", "common", "validation"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const quoteFormSchema = useMemo(() => createQuoteFormSchema(t), [t]);

  const { data: quote, isLoading: isLoadingQuote } = useQuote(id ?? "");
  const { data: clients } = useClients();
  const { data: products } = useProducts();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const { data: settings } = useCompanySettings();
  const defaultTaxRate = settings?.default_tax_rate ?? 0;
  const [notesHtml, setNotesHtml] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const submittedRef = useRef(false);
  const [defaultValidityDate] = useState(() => formatDateISO(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema) as Resolver<QuoteFormData>,
    defaultValues: {
      client_id: "",
      issue_date: formatDateISO(new Date()),
      validity_date: defaultValidityDate,
      notes: "",
      status: "DRAFT" as QuoteStatus,
      shipping_cost: 0,
      shipping_tax_rate: defaultTaxRate,
      down_payment_percent: 0,
      down_payment_amount: 0,
      discount_percent: 0,
      discount_amount: 0,
      lines: [{ description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  // Use useWatch for real-time updates when fields change
  const watchedLines = useWatch({
    control,
    name: "lines",
    defaultValue: [{ description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate }],
  });

  const watchedShippingCost = useWatch({
    control,
    name: "shipping_cost",
    defaultValue: 0,
  });

  const watchedShippingTaxRate = useWatch({
    control,
    name: "shipping_tax_rate",
    defaultValue: 0,
  });

  const watchedDiscountPercent = useWatch({
    control,
    name: "discount_percent",
    defaultValue: 0,
  });

  const watchedDiscountAmount = useWatch({
    control,
    name: "discount_amount",
    defaultValue: 0,
  });

  const watchedDownPaymentPercent = useWatch({
    control,
    name: "down_payment_percent",
    defaultValue: 0,
  });

  const watchedDownPaymentAmount = useWatch({
    control,
    name: "down_payment_amount",
    defaultValue: 0,
  });

  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);
  // react-hook-form freezes defaultValues at mount, and the company settings can
  // land a beat later — a hard reload straight onto this page is enough. The
  // form then keeps the 0 % it was born with and the document goes out with no
  // VAT on it, silently. Seed the rate once, and never over work already typed.
  const seededRate = useRef(false);
  useEffect(() => {
    if (seededRate.current || !settings || isEditing) return;
    seededRate.current = true;
    if (isDirty || !defaultTaxRate) return;
    setValue("shipping_tax_rate", defaultTaxRate);
    (getValues("lines") ?? []).forEach((_, i) =>
      setValue(`lines.${i}.tax_rate`, defaultTaxRate)
    );
  }, [settings, isEditing, isDirty, defaultTaxRate, setValue, getValues]);


  const [lastResetQuoteId, setLastResetQuoteId] = useState<string | null>(null);

  if (quote && isEditing && quote.id !== lastResetQuoteId) {
    setLastResetQuoteId(quote.id);
    reset({
      client_id: quote.client_id,
      issue_date: quote.issue_date,
      validity_date: quote.validity_date,
      notes: quote.notes ?? "",
      status: quote.status,
      shipping_cost: quote.shipping_cost ?? 0,
      shipping_tax_rate: quote.shipping_tax_rate ?? 0,
      down_payment_percent: quote.down_payment_percent ?? 0,
      down_payment_amount: quote.down_payment_amount ?? 0,
      lines: quote.lines.map((line) => ({
        product_id: line.product_id,
        description: line.description,
        description_html: line.description_html,
        quantity: line.quantity,
        unit_price: line.unit_price,
        tax_rate: line.tax_rate,
        group_name: line.group_name,
        is_subtotal_line: !!line.is_subtotal_line,
      })),
    });
    setNotesHtml(quote.notes_html || "");
  }

  // Same engine the server persists with, plus the margin — see
  // src/hooks/useDocumentTotals.ts.
  // Dense mode is a per-browser habit, not per-document.
  const [denseLines, setDenseLines] = useLocalPreference("probook.lines.dense");
  // Below lg the grid editor becomes a four-row column per line; the phone
  // editor replaces it entirely rather than sitting beside it, so the same
  // field names are never registered twice.
  const isNarrow = useIsNarrow();
  const totals = useDocumentTotals({
    lines: watchedLines,
    shippingCost: watchedShippingCost,
    shippingTaxRate: watchedShippingTaxRate,
    discountPercent: watchedDiscountPercent,
    discountAmount: watchedDiscountAmount,
    downPaymentPercent: watchedDownPaymentPercent,
    downPaymentAmount: watchedDownPaymentAmount,
    products,
  });
  const groupSubtotals = totals.groupSubtotals;

  const getStockError = (index: number): string | null => {
    const line = watchedLines[index];
    if (!line?.product_id || !products) return null;

    const product = products.find((p) => p.id === line.product_id);
    if (!product || product.is_service) return null;

    const available = product.quantity ?? 0;
    const totalUsed = watchedLines.reduce((sum, l) => {
      if (l?.product_id === line.product_id && !l?.is_subtotal_line) {
        return sum + Number(l?.quantity || 0);
      }
      return sum;
    }, 0);

    if (totalUsed > available) {
      return t("common:validation.stockExceeded", { available, total: totalUsed });
    }
    return null;
  };

  const hasStockErrors = useMemo(() => {
    return watchedLines.some((_, index) => getStockError(index) !== null);
  }, [watchedLines, products, getStockError]);

  const handleProductSelect = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setValue(`lines.${index}.product_id`, productId);
      setValue(`lines.${index}.description`, product.designation);
      setValue(`lines.${index}.unit_price`, product.unit_price);
      setValue(`lines.${index}.tax_rate`, product.tax_rate);
    }
  };

  const toggleDescriptionExpand = (index: number) => {
    setExpandedDescriptions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const onSubmit = async (data: QuoteFormData) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    const formData = {
      ...data,
      notes_html: notesHtml || null,
    };
    try {
      if (isEditing && id) {
        await updateQuote.mutateAsync({
          id,
          ...formData,
          status: data.status || "DRAFT",
        });
      } else {
        await createQuote.mutateAsync(formData);
      }
    } catch (err) {
      // Saved to the offline queue: continue back to the list (never to a
      // detail page — the quote has no server id yet).
      if (!isOfflineQueuedError(err)) {
        toast.error(getApiErrorMessage(err, t("common:messages.error")));
        return;
      }
      toast.info(t("common:offline.saved_offline"));
    }
    submittedRef.current = true;
    router.push("/quotes");
  };

  if (isEditing && isLoadingQuote) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const clientOptions = [
    { value: "", label: t("common:labels.select") },
    ...(clients?.map((c) => ({ value: c.id, label: c.name })) ?? []),
  ];

  const productOptions = [
    { value: "", label: t("quotes:lines.product") + " (" + t("common:labels.optional") + ")" },
    ...(products?.filter((p) => p.is_service || (p.quantity ?? 0) > 0).map((p) => ({ value: p.id, label: `${p.reference ? `[${p.reference}] ` : ""}${p.designation}${p.barcode ? ` - ${p.barcode}` : ""}${!p.is_service ? ` (${p.quantity ?? 0})` : ""}` })) ?? []),
  ];

  const statusOptions = [
    { value: "DRAFT", label: t("quotes:status.DRAFT") },
    { value: "SENT", label: t("quotes:status.SENT") },
    { value: "ACCEPTED", label: t("quotes:status.ACCEPTED") },
    { value: "EXPIRED", label: t("quotes:status.EXPIRED") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push("/quotes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common:buttons.back")}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {isEditing ? t("quotes:editQuote") : t("quotes:newQuote")}
          </h1>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(onSubmit)(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("quotes:generalInfo")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Controller
                name="client_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label={t("quotes:fields.client") + " *"}
                    options={clientOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("common:labels.select")}
                    error={errors.client_id?.message}
                  />
                )}
              />
              <Input
                label={t("quotes:fields.issueDate") + " *"}
                type="date"
                {...register("issue_date")}
                error={errors.issue_date?.message}
              />
              <Input
                label={t("quotes:fields.validityDate") + " *"}
                type="date"
                {...register("validity_date")}
                error={errors.validity_date?.message}
              />
              {isEditing && (
                <Select
                  label={t("quotes:fields.status")}
                  options={statusOptions}
                  {...register("status")}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{t("quotes:lines.title")}</CardTitle>
              <div className="flex items-center gap-2">
                {/* Dense mode compresses the wide grid; the phone editor has no
                    labels to drop, so the control only belongs on a wide screen. */}
                {!isNarrow && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDenseLines(!denseLines)}
                  aria-pressed={denseLines}
                  title={t(denseLines ? "quotes:lines.detailedView" : "quotes:lines.denseView")}
                >
                  {denseLines ? (
                    <Rows3 className="h-4 w-4 sm:mr-2" />
                  ) : (
                    <List className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {t(denseLines ? "quotes:lines.detailedView" : "quotes:lines.denseView")}
                  </span>
                </Button>
                )}
                {/* The phone editor carries its own add button, right under the
                    list where the new line will appear. Two of them on one screen
                    is one too many. */}
                {!isNarrow && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    append({ description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("quotes:lines.addLine")}
                </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isNarrow ? (
              <DocumentLinesMobile
                ns="quotes"
                fields={fields}
                lines={watchedLines}
                register={register}
                errors={errors}
                productOptions={productOptions}
                onSelectProduct={handleProductSelect}
                onAdd={() =>
                  append({ description: "", quantity: 1, unit_price: 0, tax_rate: defaultTaxRate })
                }
                onRemove={remove}
                stockError={getStockError}
              />
            ) : (
            <div className="space-y-4">
              {fields.map((field, index) => {
                const line = watchedLines[index];
                const lineTotal = calculateLineTotal(
                  parseFloat(String(line?.quantity)) || 0,
                  parseFloat(String(line?.unit_price)) || 0,
                  parseFloat(String(line?.tax_rate)) || 0
                );
                const isExpanded = expandedDescriptions.has(index);
                const hasRichDescription = line?.description_html && line.description_html !== "<p></p>";
                const isSubtotalLine = line?.is_subtotal_line;
                const groupName = line?.group_name || "";

                // Render subtotal lines differently
                if (isSubtotalLine) {
                  return (
                    <div
                      key={field.id}
                      className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border-l-4 border-blue-400 dark:border-blue-500"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Input
                              label=""
                              placeholder={t("quotes:lines.groupPlaceholder")}
                              {...register(`lines.${index}.group_name`)}
                              className="text-sm font-medium bg-white dark:bg-gray-800"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`lines.${index}.is_subtotal_line`}
                              {...register(`lines.${index}.is_subtotal_line`)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <label
                              htmlFor={`lines.${index}.is_subtotal_line`}
                              className="text-sm text-blue-700 dark:text-blue-300 whitespace-nowrap font-medium"
                            >
                              {t("quotes:lines.subtotalOnly")}
                            </label>
                          </div>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="text-end">
                          <span className="text-sm text-blue-600 dark:text-blue-400">{t("quotes:lines.groupTotal")}:</span>
                          <span className="ml-2 font-bold text-blue-800 dark:text-blue-200">
                            {formatCurrency(groupSubtotals[groupName]?.total || 0)} {t("quotes:totals.labelTtc")}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        {t("quotes:lines.subtotalHint").replace("{groupName}", groupName || '...')}
                      </p>
                    </div>
                  );
                }

                return (
                  <div
                    key={field.id}
                    className={`bg-gray-50 dark:bg-gray-800 rounded-lg ${
                      denseLines ? "p-2 space-y-1" : "p-4 space-y-3"
                    }`}
                  >
                    <div
                      className={`grid grid-cols-12 items-start ${
                        denseLines ? "gap-2" : "gap-3"
                      }`}
                    >
                      <div className="col-span-12 md:col-span-6 lg:col-span-3">
                        <SearchableSelect
                          label={denseLines ? "" : t("quotes:lines.product")}
                          options={productOptions}
                          value={line?.product_id || ""}
                          onChange={(val) => handleProductSelect(index, val)}
                          placeholder={t("quotes:lines.product") + " (" + t("common:labels.optional") + ")"}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6 lg:col-span-3">
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <Input
                              label={denseLines ? "" : t("quotes:lines.description") + " *"}
                              aria-label={t("quotes:lines.description")}
                              placeholder={denseLines ? t("quotes:lines.description") : undefined}
                              {...register(`lines.${index}.description`)}
                              error={errors.lines?.[index]?.description?.message}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDescriptionExpand(index)}
                            className={`p-2 mb-0.5 rounded transition-colors ${
                              isExpanded || hasRichDescription
                                ? "bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
                                : "text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                            }`}
                            title={t("quotes:richDescription")}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="col-span-4 md:col-span-3 lg:col-span-1">
                        <Input
                          label={denseLines ? "" : t("quotes:lines.quantity") + " *"}
                          aria-label={t("quotes:lines.quantity")}
                          placeholder={denseLines ? t("quotes:lines.quantity") : undefined}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.quantity`)}
                          error={errors.lines?.[index]?.quantity?.message || getStockError(index) || undefined}
                        />
                      </div>
                      <div className="col-span-4 md:col-span-3 lg:col-span-2">
                        <Input
                          label={denseLines ? "" : t("quotes:lines.unitPriceHt") + " *"}
                          aria-label={t("quotes:lines.unitPriceHt")}
                          placeholder={denseLines ? t("quotes:lines.unitPriceHt") : undefined}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.unit_price`)}
                          error={errors.lines?.[index]?.unit_price?.message}
                        />
                      </div>
                      <div className="col-span-4 md:col-span-3 lg:col-span-1">
                        <Input
                          label={denseLines ? "" : t("quotes:lines.vatRate")}
                          aria-label={t("quotes:lines.vatRate")}
                          placeholder={denseLines ? t("quotes:lines.vatRate") : undefined}
                          type="number"
                          step="0.1"
                          {...register(`lines.${index}.tax_rate`)}
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2 lg:col-span-1 flex flex-col">
                        {!denseLines && (
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("quotes:lines.totalTtc")}
                          </span>
                        )}
                        <span className="py-2 font-medium">{formatCurrency(lineTotal.total)}</span>
                      </div>
                      <div className="col-span-6 md:col-span-1 lg:col-span-1 flex items-end pb-2 justify-end md:justify-start">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                          {t("quotes:richDescription")}
                        </label>
                        <RichTextEditor
                          content={line?.description_html || ""}
                          onChange={(html, text) => {
                            setValue(`lines.${index}.description_html`, html);
                            if (text && text.trim()) {
                              setValue(`lines.${index}.description`, text);
                            }
                          }}
                          placeholder={t("quotes:richDescriptionPlaceholder")}
                          minHeight="80px"
                        />
                      </div>
                    )}
                    {/* Grouping is occasional: in dense mode it only shows on the
                        lines that already use it, so an ordinary line is one row. */}
                    <div
                      className={`items-center gap-4 ${
                        denseLines && !line?.group_name && !line?.is_subtotal_line
                          ? "hidden"
                          : "flex"
                      }`}
                    >
                      <div className="flex-1">
                        <Input
                          label=""
                          placeholder={t("quotes:lines.groupPlaceholder")}
                          aria-label={t("quotes:lines.groupPlaceholder")}
                          {...register(`lines.${index}.group_name`)}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`lines.${index}.is_subtotal_line`}
                          {...register(`lines.${index}.is_subtotal_line`)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label
                          htmlFor={`lines.${index}.is_subtotal_line`}
                          className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap"
                        >
                          {t("quotes:lines.isSubtotalLine")}
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
              {errors.lines?.message && (
                <p className="text-sm text-red-600">{errors.lines.message}</p>
              )}
            </div>
            )}

            <div className="mt-6 flex justify-end">
              <div className="w-full sm:w-72 md:w-80 lg:w-96 space-y-2">
                {/* Group subtotals */}
                {Object.keys(groupSubtotals).length > 0 && (
                  <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t("quotes:groupSubtotals")}</p>
                    {Object.entries(groupSubtotals).map(([groupName, sub]) => (
                      <div key={groupName} className="flex justify-between text-sm py-1 bg-gray-100 dark:bg-gray-800 px-2 rounded mb-1">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">{groupName}</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatCurrency(sub.beforeTax)} {t("quotes:totals.labelHt")} / {formatCurrency(sub.total)} {t("quotes:totals.labelTtc")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("quotes:totals.subtotalHt")}</span>
                  <span className="font-medium">{formatCurrency(totals.linesSubtotal)}</span>
                </div>
                {totals.documentDiscount > 0 && (
                  <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                    <span>{t("quotes:discount.label")}</span>
                    <span className="font-medium">-{formatCurrency(totals.documentDiscount)}</span>
                  </div>
                )}
                {totals.shippingCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("quotes:totals.shippingHt")}</span>
                    <span className="font-medium">{formatCurrency(totals.shippingCost)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-500">{t("quotes:totals.taxableBase")}</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("quotes:totals.vatProducts")}</span>
                  <span className="font-medium">{formatCurrency(totals.vat)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t("quotes:totals.totalTtc")}</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
                {totals.downPayment > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-primary-600">
                      <span>{t("quotes:downPayment.amountPaid")}</span>
                      <span className="font-medium">{formatCurrency(totals.downPayment)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t("quotes:downPayment.remaining")}</span>
                      <span className="font-medium">{formatCurrency(totals.remaining)}</span>
                    </div>
                  </>
                )}
                {/* Margin turns a discount into a decision. Never printed. */}
                {totals.cost > 0 && (
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-300 dark:border-gray-600 space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{t("quotes:margin.cost")}</span>
                      <span>{formatCurrency(totals.cost)}</span>
                    </div>
                    <div
                      className={`flex justify-between text-sm font-semibold ${
                        totals.margin >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      <span>{t("quotes:margin.label")}</span>
                      <span>
                        {formatCurrency(totals.margin)} ({totals.marginPercent.toFixed(1)} %)
                      </span>
                    </div>
                    {totals.costIncomplete && (
                      <p className="text-xs text-gray-400">{t("quotes:margin.partial")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("quotes:shippingAndDownPayment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label={t("quotes:shipping.costHt")}
                type="number"
                step="0.01"
                {...register("shipping_cost")}
              />
              <Input
                label={t("quotes:shipping.vatRate")}
                type="number"
                step="0.1"
                {...register("shipping_tax_rate")}
              />
              <Input
                label={t("quotes:downPayment.percent")}
                type="number"
                step="1"
                {...register("down_payment_percent")}
                placeholder={t("quotes:downPayment.percentPlaceholder")}
              />
              <Input
                label={t("quotes:downPayment.amount")}
                type="number"
                step="0.01"
                {...register("down_payment_amount")}
                placeholder={t("quotes:downPayment.amountPlaceholder")}
              />
              <Input
                label={t("quotes:discount.percent")}
                type="number"
                step="0.1"
                {...register("discount_percent")}
                error={errors.discount_percent?.message}
              />
              <Input
                label={t("quotes:discount.amount")}
                type="number"
                step="0.01"
                {...register("discount_amount")}
                error={errors.discount_amount?.message}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{t("quotes:discount.hint")}</p>
            <p className="text-sm text-gray-500 mt-2">
              {t("quotes:downPaymentHint")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("quotes:fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RichTextEditor
              content={notesHtml}
              onChange={(html, text) => {
                setNotesHtml(html);
                setValue("notes", text);
              }}
              placeholder={t("quotes:notesPlaceholder")}
              minHeight="120px"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push("/quotes")}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createQuote.isPending || updateQuote.isPending}
            disabled={hasStockErrors}
          >
            {isEditing ? t("common:buttons.save") : t("quotes:createQuote")}
          </Button>
        </div>
      </form>
      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
    </div>
  );
}
