import { useEffect, useMemo, useRef } from "react";
import { useRouter, useParams } from "@/lib/navigation";
import { useForm, useFieldArray, useWatch, Controller, type Resolver } from "react-hook-form";
import { toast } from "@/stores/useToastStore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Select,
  SearchableSelect,
} from "@/components/ui";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { useClients } from "@/features/clients/hooks/useClients";
import { useProducts } from "@/features/products/hooks/useProducts";
import {
  useDeliveryNote,
  useCreateDeliveryNote,
  useUpdateDeliveryNote,
} from "./hooks/useDeliveryNotes";
import {
  createDeliveryNoteSchema,
  type DeliveryNoteFormData,
} from "./schemas/deliveryNoteSchema";
import type { DeliveryNoteStatus } from "@/types";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";


export function DeliveryNoteFormPage() {
  const { t } = useTranslation(["delivery", "common"]);
  const router = useRouter();
  const { isDemoMode, showSubscribePrompt } = useDemoMode();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const statusOptions = [
    { value: "DRAFT", label: t("delivery:status.DRAFT") },
    { value: "DELIVERED", label: t("delivery:status.DELIVERED") },
    { value: "CANCELLED", label: t("delivery:status.CANCELLED") },
  ];

  const unitOptions = [
    { value: "unit", label: t("delivery:units.unit") },
    { value: "piece", label: t("delivery:units.piece") },
    { value: "carton", label: t("delivery:units.carton") },
    { value: "pallet", label: t("delivery:units.palette") },
    { value: "kg", label: t("delivery:units.kg") },
    { value: "m", label: t("delivery:units.m") },
    { value: "sqm", label: t("delivery:units.m2") },
    { value: "l", label: t("delivery:units.l") },
  ];

  const { data: existingNote, isLoading: isLoadingNote } = useDeliveryNote(id || "");
  const { data: clients } = useClients();
  const { data: products } = useProducts();
  const createDeliveryNote = useCreateDeliveryNote();
  const updateDeliveryNote = useUpdateDeliveryNote();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm<DeliveryNoteFormData & { status?: DeliveryNoteStatus }>({
    resolver: zodResolver(createDeliveryNoteSchema(t)) as Resolver<DeliveryNoteFormData>,
    defaultValues: {
      client_id: "",
      issue_date: new Date().toISOString().split("T")[0],
      delivery_date: "",
      delivery_address: "",
      notes: "",
      lines: [{ description: "", quantity: 1, unit: "unit", product_id: null }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
  });

  const watchedLines = useWatch({
    control,
    name: "lines",
    defaultValue: [{ description: "", quantity: 1, unit: "unit", product_id: null }],
  });

  const getStockError = (index: number): string | null => {
    const line = watchedLines[index];
    if (!line?.product_id || !products) return null;

    const product = products.find((p) => p.id === line.product_id);
    if (!product || product.is_service) return null;

    const available = product.quantity ?? 0;
    const totalUsed = watchedLines.reduce((sum, l) => {
      if (l?.product_id === line.product_id) {
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

  const submittedRef = useRef(false);
  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);

  // Load existing delivery note data when editing
  useEffect(() => {
    if (existingNote && isEdit) {
      reset({
        client_id: existingNote.client_id,
        quote_id: existingNote.quote_id,
        invoice_id: existingNote.invoice_id,
        issue_date: existingNote.issue_date,
        delivery_date: existingNote.delivery_date || "",
        delivery_address: existingNote.delivery_address || "",
        notes: existingNote.notes || "",
        status: existingNote.status,
        lines: existingNote.lines.map((line) => ({
          product_id: line.product_id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit || "unit",
        })),
      });
    }
  }, [existingNote, isEdit, reset]);

  const handleProductSelect = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setValue(`lines.${index}.description`, product.designation);
      setValue(`lines.${index}.unit`, product.unit);
    }
  };

  const onSubmit = async (data: DeliveryNoteFormData & { status?: DeliveryNoteStatus }) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    try {
      // Transform empty strings to null for optional fields
      const input = {
        ...data,
        quote_id: data.quote_id || null,
        invoice_id: data.invoice_id || null,
        delivery_date: data.delivery_date || null,
        delivery_address: data.delivery_address || null,
        notes: data.notes || null,
        lines: data.lines.map((line) => ({
          ...line,
          product_id: line.product_id || null,
          unit: line.unit || null,
        })),
      };

      if (isEdit && id) {
        await updateDeliveryNote.mutateAsync({
          id,
          ...input,
          status: data.status || "DRAFT",
        });
        submittedRef.current = true;
        router.push(`/delivery-notes/${id}`);
      } else {
        const newNote = await createDeliveryNote.mutateAsync(input);
        submittedRef.current = true;
        router.push(`/delivery-notes/${newNote.id}`);
      }
    } catch {
      toast.error(t("delivery:errorSaving"));
    }
  };

  const clientOptions = [
    { value: "", label: t("delivery:selectClient") },
    ...(clients?.map((c) => ({ value: c.id, label: c.name })) || []),
  ];

  const productOptions = [
    { value: "", label: t("delivery:selectProduct") },
    ...(products?.filter((p) => p.is_service || (p.quantity ?? 0) > 0).map((p) => ({ value: p.id, label: `${p.designation}${p.reference ? ` [${p.reference}]` : ""}${p.barcode ? ` - ${p.barcode}` : ""}${!p.is_service ? ` (${p.quantity ?? 0})` : ""}` })) || []),
  ];

  if (isEdit && isLoadingNote) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/delivery-notes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("common:buttons.back")}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {isEdit ? t("delivery:editDeliveryNote") : t("delivery:newDeliveryNote")}
          </h1>
          <p className="text-(--color-text-secondary)">
            {isEdit
              ? `${t("delivery:modifyingNote")} ${existingNote?.delivery_note_number}`
              : t("delivery:createNewNote")}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(onSubmit)(e)} className="space-y-6">
        {/* Client and Dates */}
        <Card>
          <CardHeader>
            <CardTitle>{t("delivery:generalInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Controller
                name="client_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                    label={`${t("delivery:fields.client")} *`}
                    options={clientOptions}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t("delivery:selectClient")}
                    error={errors.client_id?.message}
                  />
                )}
              />
              {isEdit && (
                <Select
                  label={t("delivery:fields.status")}
                  options={statusOptions}
                  {...register("status")}
                />
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={`${t("delivery:fields.issueDate")} *`}
                type="date"
                {...register("issue_date")}
                error={errors.issue_date?.message}
              />
              <Input
                label={t("delivery:fields.deliveryDate")}
                type="date"
                {...register("delivery_date")}
                error={errors.delivery_date?.message}
              />
            </div>
            <Textarea
              label={t("delivery:fields.deliveryAddress")}
              {...register("delivery_address")}
              error={errors.delivery_address?.message}
              rows={2}
              placeholder={t("delivery:addressPlaceholder")}
            />
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("delivery:lines.title")}</CardTitle>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  append({ description: "", quantity: 1, unit: "unit", product_id: null }) 
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                {t("delivery:lines.addLine")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-lg bg-(--color-bg-secondary) space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-(--color-text-secondary)">
                    {t("delivery:line")} {index + 1}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <SearchableSelect
                    label={t("delivery:lines.product")}
                    options={productOptions}
                    value={watchedLines[index]?.product_id || ""}
                    onChange={(val) => {
                      setValue(`lines.${index}.product_id`, val || null);
                      if (val) {
                        handleProductSelect(index, val);
                      }
                    }}
                    placeholder={t("delivery:selectProduct")}
                  />
                  <div className="md:col-span-2">
                    <Input
                      label={`${t("delivery:lines.description")} *`}
                      {...register(`lines.${index}.description`)}
                      error={errors.lines?.[index]?.description?.message}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={`${t("delivery:lines.quantity")} *`}
                      type="number"
                      step="0.01"
                      {...register(`lines.${index}.quantity`)}
                      error={errors.lines?.[index]?.quantity?.message || getStockError(index) || undefined}
                    />
                    <Select
                      label={t("delivery:lines.unit")}
                      options={unitOptions}
                      {...register(`lines.${index}.unit`)}
                    />
                  </div>
                </div>
              </div>
            ))}
            {errors.lines?.message && (
              <p className="text-sm text-red-500">{errors.lines.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>{t("delivery:fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              {...register("notes")}
              rows={3}
              placeholder={t("delivery:deliveryInstructions")}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/delivery-notes")}
          >
            {t("common:buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createDeliveryNote.isPending || updateDeliveryNote.isPending}
            disabled={hasStockErrors}
          >
            {isEdit ? t("common:buttons.save") : t("delivery:createDeliveryNote")}
          </Button>
        </div>
      </form>
      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
    </div>
  );
}
