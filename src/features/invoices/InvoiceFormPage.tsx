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
import { useInvoice, useCreateInvoice, useUpdateInvoice } from "./hooks/useInvoices";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useAuthStore } from "@/stores/useAuthStore";
import { useClients } from "@/features/clients";
import { useProducts } from "@/features/products";
import { formatCurrency, formatDateISO, calculateLineTotal } from "@/lib/utils";
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
  description: z.string().min(1, t("validation:invoice.lineDescriptionRequired")),
  description_html: z.string().nullable().optional(),
  quantity: z.coerce.number().min(0.01, t("validation:invoice.lineQuantityPositive")),
  unit_price: z.coerce.number().min(0, t("validation:invoice.linePricePositive")),
  tax_rate: z.coerce.number().min(0).max(100),
  group_name: z.string().nullable().optional(),
  is_subtotal_line: z.boolean().optional(),
});

const createInvoiceFormSchema = (t: (key: string) => string) => z.object({
  client_id: z.string().min(1, t("validation:invoice.clientRequired")),
  issue_date: z.string().min(1, t("validation:invoice.issueDateRequired")),
  due_date: z.string().min(1, t("validation:invoice.dueDateRequired")),
  notes: z.string().nullable().optional(),
  // PAID is not creatable/editable here: it only comes from payments/mark-paid.
  status: z.enum(["DRAFT", "ISSUED"]).optional(),
  shipping_cost: z.coerce.number().min(0).optional(),
  shipping_tax_rate: z.coerce.number().min(0).max(100).optional(),
  down_payment_percent: z.coerce.number().min(0).max(100).optional(),
  down_payment_amount: z.coerce.number().min(0).optional(),
  discount_percent: z.coerce.number().min(0).max(100).optional(),
  discount_amount: z.coerce.number().min(0).optional(),
  is_cash_sale: z.boolean().optional(),
  stamp_duty_exempt: z.boolean().optional(),
  lines: z.array(createLineSchema(t)).min(1, t("validation:invoice.linesRequired")),
});

type InvoiceFormData = z.output<ReturnType<typeof createInvoiceFormSchema>>;

export function InvoiceFormPage() {
  const { t } = useTranslation(["invoices", "common", "validation"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const { hasPermission } = useAuthStore();
  const canManage = isEditing ? hasPermission("invoices", "edit") : hasPermission("invoices", "create");

  const invoiceFormSchema = useMemo(() => createInvoiceFormSchema(t), [t]);

  const { data: invoice, isLoading: isLoadingInvoice } = useInvoice(id ?? "");
  const { data: clients } = useClients();
  const { data: products } = useProducts();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const { data: settings } = useCompanySettings();
  const defaultTaxRate = settings?.default_tax_rate ?? 0;
  const [notesHtml, setNotesHtml] = useState("");
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const submittedRef = useRef(false);
  const [defaultDueDate] = useState(() => formatDateISO(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormData>,
    defaultValues: {
      client_id: "",
      issue_date: formatDateISO(new Date()),
      due_date: defaultDueDate,
      notes: "",
      status: "DRAFT",
      shipping_cost: 0,
      shipping_tax_rate: defaultTaxRate,
      down_payment_percent: 0,
      down_payment_amount: 0,
      discount_percent: 0,
      discount_amount: 0,
      // Most timbre-enabled businesses are cash-based; default on (only matters
      // when stamp duty is enabled in settings). Uncheck for transfer/cheque.
      is_cash_sale: true,
      stamp_duty_exempt: false,
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

  // Redirect if trying to edit an issued or paid invoice
  useEffect(() => {
    if (invoice && isEditing && invoice.status !== "DRAFT") {
      router.push(`/invoices/${id}`);
    }
  }, [invoice, isEditing, id, router]);

  // Redirect if the user lacks the create/edit permission for invoices.
  useEffect(() => {
    if (!canManage) {
      router.push("/invoices");
    }
  }, [canManage, router]);

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


  const [lastResetInvoiceId, setLastResetInvoiceId] = useState<string | null>(null);

  if (invoice && isEditing && invoice.id !== lastResetInvoiceId) {
    setLastResetInvoiceId(invoice.id);
    reset({
      client_id: invoice.client_id,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      notes: invoice.notes ?? "",
      // Only DRAFT invoices are editable (non-drafts redirect above).
      status: invoice.status === "ISSUED" ? "ISSUED" : "DRAFT",
      shipping_cost: invoice.shipping_cost ?? 0,
      shipping_tax_rate: invoice.shipping_tax_rate ?? 0,
      down_payment_percent: invoice.down_payment_percent ?? 0,
      down_payment_amount: invoice.down_payment_amount ?? 0,
      is_cash_sale: invoice.is_cash_sale ?? false,
      stamp_duty_exempt: invoice.stamp_duty_exempt ?? false,
      lines: invoice.lines.map((line) => ({
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
    setNotesHtml(invoice.notes_html || "");
  }

  // Totals come from the same engine the server persists with, so what is on
  // screen while typing cannot drift from what gets saved. It also gives us the
  // margin, which is what makes a discount an informed decision.
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

  // Precompute total quantity used per product once per lines change, so each
  // per-line stock check is an O(1) lookup instead of a reduce over all lines.
  const getStockError = useMemo(() => {
    const usedByProduct = new Map<string, number>();
    for (const l of watchedLines) {
      if (l?.product_id && !l?.is_subtotal_line) {
        usedByProduct.set(
          l.product_id,
          (usedByProduct.get(l.product_id) ?? 0) + Number(l?.quantity || 0)
        );
      }
    }

    return (index: number): string | null => {
      const line = watchedLines[index];
      if (!line?.product_id || !products) return null;

      const product = products.find((p) => p.id === line.product_id);
      if (!product || product.is_service) return null;

      const available = product.quantity ?? 0;
      const totalUsed = usedByProduct.get(line.product_id) ?? 0;

      if (totalUsed > available) {
        return t("common:validation.stockExceeded", { available, total: totalUsed });
      }
      return null;
    };
  }, [watchedLines, products, t]);

  const hasStockErrors = useMemo(() => {
    return watchedLines.some((_, index) => getStockError(index) !== null);
  }, [watchedLines, getStockError]);

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

  const onSubmit = async (data: InvoiceFormData) => {
    if (!canManage) return;
    if (isDemoMode) { showSubscribePrompt(); return; }
    const formData = {
      ...data,
      notes_html: notesHtml || null,
    };
    try {
      if (isEditing && id) {
        await updateInvoice.mutateAsync({
          id,
          ...formData,
        });
      } else {
        // Minted per submit (not per render) so an offline replay of this exact
        // request dedupes server-side instead of creating a second invoice.
        const payload = { ...formData, idempotency_key: crypto.randomUUID() };
        await createInvoice.mutateAsync(payload);
      }
    } catch (err) {
      // Saved to the offline queue: continue back to the list (never to a
      // detail page — the invoice has no server id yet).
      if (!isOfflineQueuedError(err)) {
        toast.error(getApiErrorMessage(err, t("common:messages.error")));
        return;
      }
      toast.info(t("common:offline.saved_offline"));
    }
    submittedRef.current = true;
    router.push("/invoices");
  };

  if (isEditing && isLoadingInvoice) {
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
    { value: "", label: t("invoices:lines.product") + " (" + t("common:labels.optional") + ")" },
    ...(products?.filter((p) => p.is_service || (p.quantity ?? 0) > 0).map((p) => ({ value: p.id, label: `${p.reference ? `[${p.reference}] ` : ""}${p.designation}${p.barcode ? ` - ${p.barcode}` : ""}${!p.is_service ? ` (${p.quantity ?? 0})` : ""}` })) ?? []),
  ];

  const statusOptions = [
    { value: "DRAFT", label: t("invoices:status.DRAFT") },
    { value: "ISSUED", label: t("invoices:status.ISSUED") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common:buttons.back")}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {isEditing ? t("invoices:editInvoice") : t("invoices:newInvoice")}
          </h1>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(onSubmit)(e)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("invoices:generalInfo")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Controller
                name="client_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label={t("invoices:fields.client") + " *"}
                    options={clientOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("common:labels.select")}
                    error={errors.client_id?.message}
                  />
                )}
              />
              <Input
                label={t("invoices:fields.issueDate") + " *"}
                type="date"
                {...register("issue_date")}
                error={errors.issue_date?.message}
              />
              <Input
                label={t("invoices:fields.dueDate") + " *"}
                type="date"
                {...register("due_date")}
                error={errors.due_date?.message}
              />
              {isEditing && (
                <Select
                  label={t("invoices:fields.status")}
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
              <CardTitle>{t("invoices:lines.title")}</CardTitle>
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
                  title={t(denseLines ? "invoices:lines.detailedView" : "invoices:lines.denseView")}
                >
                  {denseLines ? (
                    <Rows3 className="h-4 w-4 sm:mr-2" />
                  ) : (
                    <List className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">
                    {t(denseLines ? "invoices:lines.detailedView" : "invoices:lines.denseView")}
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
                  {t("invoices:lines.addLine")}
                </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isNarrow ? (
              <DocumentLinesMobile
                ns="invoices"
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
                              placeholder={t("invoices:lines.groupPlaceholder")}
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
                              {t("invoices:lines.subtotalOnly")}
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
                          <span className="text-sm text-blue-600 dark:text-blue-400">{t("invoices:lines.groupTotal")}:</span>
                          <span className="ml-2 font-bold text-blue-800 dark:text-blue-200">
                            {formatCurrency(groupSubtotals[groupName]?.total || 0)} {t("invoices:totals.labelTtc")}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        {t("invoices:lines.subtotalHint").replace("{groupName}", groupName || '...')}
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
                          label={denseLines ? "" : t("invoices:lines.product")}
                          options={productOptions}
                          value={line?.product_id || ""}
                          onChange={(val) => handleProductSelect(index, val)}
                          placeholder={t("invoices:lines.product") + " (" + t("common:labels.optional") + ")"}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6 lg:col-span-3">
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <Input
                              label={denseLines ? "" : t("invoices:lines.description") + " *"}
                              aria-label={t("invoices:lines.description")}
                              placeholder={denseLines ? t("invoices:lines.description") : undefined}
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
                            title={t("invoices:richDescription")}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-1">
                        <Input
                          label={denseLines ? "" : t("invoices:lines.quantity") + " *"}
                          aria-label={t("invoices:lines.quantity")}
                          placeholder={denseLines ? t("invoices:lines.quantity") : undefined}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.quantity`)}
                          error={errors.lines?.[index]?.quantity?.message || getStockError(index) || undefined}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-2">
                        <Input
                          label={denseLines ? "" : t("invoices:lines.unitPriceHt") + " *"}
                          aria-label={t("invoices:lines.unitPriceHt")}
                          placeholder={denseLines ? t("invoices:lines.unitPriceHt") : undefined}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.unit_price`)}
                          error={errors.lines?.[index]?.unit_price?.message}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-1">
                        <Input
                          label={denseLines ? "" : t("invoices:lines.vatRate")}
                          aria-label={t("invoices:lines.vatRate")}
                          placeholder={denseLines ? t("invoices:lines.vatRate") : undefined}
                          type="number"
                          step="0.1"
                          {...register(`lines.${index}.tax_rate`)}
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2 lg:col-span-1 flex flex-col">
                        {!denseLines && (
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {t("invoices:lines.totalTtc")}
                          </span>
                        )}
                        <span className="py-2 font-medium">{formatCurrency(lineTotal.total)}</span>
                      </div>
                      <div className="col-span-12 sm:col-span-6 md:col-span-1 lg:col-span-1 flex items-end pb-2 justify-end md:justify-start">
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
                          {t("invoices:richDescription")}
                        </label>
                        <RichTextEditor
                          content={line?.description_html || ""}
                          onChange={(html, text) => {
                            setValue(`lines.${index}.description_html`, html);
                            if (text && text.trim()) {
                              setValue(`lines.${index}.description`, text);
                            }
                          }}
                          placeholder={t("invoices:richDescriptionPlaceholder")}
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
                          placeholder={t("invoices:lines.groupPlaceholder")}
                          aria-label={t("invoices:lines.groupPlaceholder")}
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
                          {t("invoices:lines.isSubtotalLine")}
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
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t("invoices:groupSubtotals")}</p>
                    {Object.entries(groupSubtotals).map(([groupName, sub]) => (
                      <div key={groupName} className="flex justify-between text-sm py-1 bg-gray-100 dark:bg-gray-800 px-2 rounded mb-1">
                        <span className="text-gray-600 dark:text-gray-400 font-medium">{groupName}</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatCurrency(sub.beforeTax)} {t("invoices:totals.labelHt")} / {formatCurrency(sub.total)} {t("invoices:totals.labelTtc")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("invoices:totals.subtotalHt")}</span>
                  <span className="font-medium">{formatCurrency(totals.linesSubtotal)}</span>
                </div>
                {totals.documentDiscount > 0 && (
                  <div className="flex justify-between text-sm text-amber-700 dark:text-amber-400">
                    <span>{t("invoices:discount.label")}</span>
                    <span className="font-medium">-{formatCurrency(totals.documentDiscount)}</span>
                  </div>
                )}
                {totals.shippingCost > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{t("invoices:totals.shippingHt")}</span>
                    <span className="font-medium">{formatCurrency(totals.shippingCost)}</span>
                  </div>
                )}
                {/* Taxable base: what VAT is actually charged on. */}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-gray-500">{t("invoices:totals.taxableBase")}</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("invoices:totals.vatProducts")}</span>
                  <span className="font-medium">{formatCurrency(totals.vat)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t("invoices:totals.totalTtc")}</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
                {totals.downPayment > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-primary-600">
                      <span>{t("invoices:downPayment.amountPaid")}</span>
                      <span className="font-medium">{formatCurrency(totals.downPayment)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t("invoices:downPayment.remaining")}</span>
                      <span className="font-medium">{formatCurrency(totals.remaining)}</span>
                    </div>
                  </>
                )}
                {/* Margin: the figure that turns a discount into a decision
                    rather than a guess. Never printed on the document. */}
                {totals.cost > 0 && (
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-300 dark:border-gray-600 space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{t("invoices:margin.cost")}</span>
                      <span>{formatCurrency(totals.cost)}</span>
                    </div>
                    <div
                      className={`flex justify-between text-sm font-semibold ${
                        totals.margin >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      <span>{t("invoices:margin.label")}</span>
                      <span>
                        {formatCurrency(totals.margin)} ({totals.marginPercent.toFixed(1)} %)
                      </span>
                    </div>
                    {totals.costIncomplete && (
                      <p className="text-xs text-gray-400">{t("invoices:margin.partial")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("invoices:shippingAndDownPayment")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label={t("invoices:shipping.costHt")}
                type="number"
                step="0.01"
                {...register("shipping_cost")}
              />
              <Input
                label={t("invoices:shipping.vatRate")}
                type="number"
                step="0.1"
                {...register("shipping_tax_rate")}
              />
              <Input
                label={t("invoices:downPayment.percent")}
                type="number"
                step="1"
                {...register("down_payment_percent")}
                placeholder={t("invoices:downPayment.percentPlaceholder")}
              />
              <Input
                label={t("invoices:downPayment.amount")}
                type="number"
                step="0.01"
                {...register("down_payment_amount")}
                placeholder={t("invoices:downPayment.amountPlaceholder")}
              />
              <Input
                label={t("invoices:discount.percent")}
                type="number"
                step="0.1"
                {...register("discount_percent")}
                error={errors.discount_percent?.message}
              />
              <Input
                label={t("invoices:discount.amount")}
                type="number"
                step="0.01"
                {...register("discount_amount")}
                error={errors.discount_amount?.message}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{t("invoices:discount.hint")}</p>
            <p className="text-sm text-gray-500 mt-2">
              {t("invoices:downPaymentHint")}
            </p>
            {settings?.stamp_duty_enabled && (
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" {...register("is_cash_sale")} className="rounded" />
                  {t("invoices:stampDuty.cashSale")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" {...register("stamp_duty_exempt")} className="rounded" />
                  {t("invoices:stampDuty.exempt")}
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("invoices:fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RichTextEditor
              content={notesHtml}
              onChange={(html, text) => {
                setNotesHtml(html);
                setValue("notes", text);
              }}
              placeholder={t("invoices:notesPlaceholder")}
              minHeight="120px"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => router.push("/invoices")}>
            {t("common:buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createInvoice.isPending || updateInvoice.isPending}
            disabled={hasStockErrors}
          >
            {isEditing ? t("common:buttons.save") : t("invoices:createInvoice")}
          </Button>
        </div>
      </form>
      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
    </div>
  );
}
