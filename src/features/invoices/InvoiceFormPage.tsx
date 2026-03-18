import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "@/lib/navigation";
import { useTranslation } from "react-i18next";
import { useForm, useFieldArray, useWatch, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, ArrowLeft, FileText } from "lucide-react";
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
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { useInvoice, useCreateInvoice, useUpdateInvoice } from "./hooks/useInvoices";
import { useClients } from "@/features/clients";
import { useProducts } from "@/features/products";
import { formatCurrency, formatDateISO, calculateLineTotal } from "@/lib/utils";
import type { InvoiceStatus } from "@/types";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";

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
  status: z.enum(["DRAFT", "ISSUED", "PAID"]).optional(),
  shipping_cost: z.coerce.number().min(0).optional(),
  shipping_tax_rate: z.coerce.number().min(0).max(100).optional(),
  down_payment_percent: z.coerce.number().min(0).max(100).optional(),
  down_payment_amount: z.coerce.number().min(0).optional(),
  lines: z.array(createLineSchema(t)).min(1, t("validation:invoice.linesRequired")),
});

type InvoiceFormData = z.output<ReturnType<typeof createInvoiceFormSchema>>;

export function InvoiceFormPage() {
  const { t } = useTranslation(["invoices", "common", "validation"]);
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

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
    reset,
    formState: { errors, isDirty },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema) as Resolver<InvoiceFormData>,
    defaultValues: {
      client_id: "",
      issue_date: formatDateISO(new Date()),
      due_date: defaultDueDate,
      notes: "",
      status: "DRAFT" as InvoiceStatus,
      shipping_cost: 0,
      shipping_tax_rate: defaultTaxRate,
      down_payment_percent: 0,
      down_payment_amount: 0,
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

  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);

  const [lastResetInvoiceId, setLastResetInvoiceId] = useState<string | null>(null);

  if (invoice && isEditing && invoice.id !== lastResetInvoiceId) {
    setLastResetInvoiceId(invoice.id);
    reset({
      client_id: invoice.client_id,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      notes: invoice.notes ?? "",
      status: invoice.status,
      shipping_cost: invoice.shipping_cost ?? 0,
      shipping_tax_rate: invoice.shipping_tax_rate ?? 0,
      down_payment_percent: invoice.down_payment_percent ?? 0,
      down_payment_amount: invoice.down_payment_amount ?? 0,
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

  // Calculate totals reactively based on watched lines and shipping
  const { totals, groupSubtotals } = useMemo(() => {
    if (!watchedLines) return {
      totals: { beforeTax: 0, vat: 0, total: 0, shippingCost: 0, shippingVat: 0, shippingTotal: 0, downPayment: 0 },
      groupSubtotals: {} as Record<string, { beforeTax: number; vat: number; total: number }>
    };

    const groups: Record<string, { beforeTax: number; vat: number; total: number }> = {};

    const lineTotals = watchedLines.reduce(
      (acc, line) => {
        // Skip subtotal lines - they don't contribute to totals
        if (line?.is_subtotal_line) return acc;

        const { subtotal, taxAmount, total } = calculateLineTotal(
          parseFloat(String(line?.quantity)) || 0,
          parseFloat(String(line?.unit_price)) || 0,
          parseFloat(String(line?.tax_rate)) || 0
        );

        // Track group subtotals
        const groupName = line?.group_name || "";
        if (groupName) {
          if (!groups[groupName]) {
            groups[groupName] = { beforeTax: 0, vat: 0, total: 0 };
          }
          groups[groupName].beforeTax += subtotal;
          groups[groupName].vat += taxAmount;
          groups[groupName].total += total;
        }

        return {
          beforeTax: acc.beforeTax + subtotal,
          vat: acc.vat + taxAmount,
          total: acc.total + total,
        };
      },
      { beforeTax: 0, vat: 0, total: 0 }
    );

    // Calculate shipping (parseFloat to handle string values from form inputs)
    const shippingCost = parseFloat(String(watchedShippingCost)) || 0;
    const shippingTaxRate = parseFloat(String(watchedShippingTaxRate)) || 0;
    const shippingVat = shippingCost * (shippingTaxRate / 100);
    const shippingTotal = shippingCost + shippingVat;

    // Calculate down payment (use fixed amount if set, otherwise calculate from percentage)
    const grandTotal = lineTotals.total + shippingTotal;
    const dpAmount = parseFloat(String(watchedDownPaymentAmount)) || 0;
    const dpPercent = parseFloat(String(watchedDownPaymentPercent)) || 0;
    const downPayment = dpAmount > 0
      ? dpAmount
      : (dpPercent > 0 ? grandTotal * (dpPercent / 100) : 0);

    return {
      totals: {
        beforeTax: lineTotals.beforeTax,
        vat: lineTotals.vat,
        total: lineTotals.total,
        shippingCost,
        shippingVat,
        shippingTotal,
        downPayment,
      },
      groupSubtotals: groups,
    };
  }, [watchedLines, watchedShippingCost, watchedShippingTaxRate, watchedDownPaymentPercent, watchedDownPaymentAmount]);

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

  const onSubmit = async (data: InvoiceFormData) => {
    const formData = {
      ...data,
      notes_html: notesHtml || null,
    };
    if (isEditing && id) {
      await updateInvoice.mutateAsync({
        id,
        ...formData,
      });
    } else {
      await createInvoice.mutateAsync(formData);
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
    { value: "PAID", label: t("invoices:status.PAID") },
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
            <div className="flex items-center justify-between">
              <CardTitle>{t("invoices:lines.title")}</CardTitle>
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
            </div>
          </CardHeader>
          <CardContent>
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
                        <div className="text-right">
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
                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3"
                  >
                    <div className="grid grid-cols-12 gap-3 items-start">
                      <div className="col-span-12 md:col-span-6 lg:col-span-3">
                        <SearchableSelect
                          label={t("invoices:lines.product")}
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
                              label={t("invoices:lines.description") + " *"}
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
                          label={t("invoices:lines.quantity") + " *"}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.quantity`)}
                          error={errors.lines?.[index]?.quantity?.message || getStockError(index) || undefined}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-2">
                        <Input
                          label={t("invoices:lines.unitPriceHt") + " *"}
                          type="number"
                          step="0.01"
                          {...register(`lines.${index}.unit_price`)}
                          error={errors.lines?.[index]?.unit_price?.message}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-4 md:col-span-3 lg:col-span-1">
                        <Input
                          label={t("invoices:lines.vatRate")}
                          type="number"
                          step="0.1"
                          {...register(`lines.${index}.tax_rate`)}
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2 lg:col-span-1 flex flex-col">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("invoices:lines.totalTtc")}</span>
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
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Input
                          label=""
                          placeholder={t("invoices:lines.groupPlaceholder")}
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
                  <span className="font-medium">{formatCurrency(totals.beforeTax)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t("invoices:totals.vatProducts")}</span>
                  <span className="font-medium">{formatCurrency(totals.vat)}</span>
                </div>
                {totals.shippingCost > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t("invoices:totals.shippingHt")}</span>
                      <span className="font-medium">{formatCurrency(totals.shippingCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t("invoices:totals.shippingVat")}</span>
                      <span className="font-medium">{formatCurrency(totals.shippingVat)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t("invoices:totals.totalTtc")}</span>
                  <span>{formatCurrency(totals.total + totals.shippingTotal)}</span>
                </div>
                {totals.downPayment > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-primary-600">
                      <span>{t("invoices:downPayment.amountPaid")}</span>
                      <span className="font-medium">{formatCurrency(totals.downPayment)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">{t("invoices:downPayment.remaining")}</span>
                      <span className="font-medium">{formatCurrency(totals.total + totals.shippingTotal - totals.downPayment)}</span>
                    </div>
                  </>
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
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {t("invoices:downPaymentHint")}
            </p>
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
