import { useRef, useState, useEffect } from "react";
import { useIsNarrow } from "@/hooks/useIsNarrow";
import { DocumentLinesMobile } from "@/components/documents/DocumentLinesMobile";
import { useRouter, useParams } from "@/lib/navigation";
import { useForm, useFieldArray, useWatch, Controller, type Resolver } from "react-hook-form";
import { toast } from "@/stores/useToastStore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import {
  Button,
  FormActionBar,
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
import { useDocumentCatalog } from "@/hooks/useDocumentCatalog";
import { stockShortfalls } from "@/lib/stock-shortfalls";
import { collapseDocumentLines, expandEditorLines } from "@/lib/bundles";
import { BundleContents } from "@/components/documents/BundleContents";
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
import { TagPicker } from "@/components/documents/TagPicker";
import { TagsModal } from "@/components/documents/TagsModal";
import { toDateInput } from "@/lib/utils";


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
  // A delivery note sends out what is on the shelf: out-of-stock products and
  // variants are not offered.
  const catalog = useDocumentCatalog({ hideOutOfStock: true });
  const products = catalog.products;
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
      tag_ids: [],
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

  // Stock is measured per variant when the line names one — see
  // src/lib/stock-shortfalls.ts.
  const shortfalls = stockShortfalls(watchedLines, products);
  const getStockError = (index: number): string | null => {
    const shortfall = shortfalls[index];
    if (!shortfall) return null;
    const message = t("common:validation.stockExceeded", { available: shortfall.available, total: shortfall.requested });
    // On a pack line, say which component runs short.
    return shortfall.item ? `${shortfall.item}: ${message}` : message;
  };
  const hasStockErrors = shortfalls.some(Boolean);

  // The variant is what the stock is counted on, so a line cannot leave without it.
  const getVariantError = (index: number): string | null =>
    catalog.needsVariant(watchedLines[index]) ? catalog.variantRequiredMessage : null;
  const hasMissingVariant = watchedLines.some((_, index) => getVariantError(index) !== null);

  const submittedRef = useRef(false);
  const blocker = useUnsavedChangesGuard(() => isDirty && !submittedRef.current);

  // Seed the form from the note being edited — once per note, the way the
  // invoice and quote forms do it. As an effect keyed on the note itself it
  // re-ran on every refetch and overwrote whatever was being typed.
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [lastResetNoteId, setLastResetNoteId] = useState<string | null>(null);

  // Seeded from an effect, not from the render itself.
  //
  // `reset()` called while rendering never reaches useFieldArray: the values
  // land, the list of fields does not, and the editor shows one line for a
  // document that has five. Adding a line resynced it, which is how a customer
  // found the missing ones. It only bit when the document was already in the
  // cache — coming back from its own page, or a reload — because that is when
  // the data is there on the very first render.
  useEffect(() => {
    if (!existingNote || !isEdit || existingNote.id === lastResetNoteId) return;
    setLastResetNoteId(existingNote.id);
    reset({
      client_id: existingNote.client_id,
      quote_id: existingNote.quote_id,
      invoice_id: existingNote.invoice_id,
      issue_date: toDateInput(existingNote.issue_date),
      delivery_date: toDateInput(existingNote.delivery_date),
      delivery_address: existingNote.delivery_address || "",
      notes: existingNote.notes || "",
      status: existingNote.status,
      // A pack comes back as one line carrying its components.
      lines: collapseDocumentLines(existingNote.lines).map((line) => ({
        product_id: line.product_id,
        variant_id: line.variant_id ?? null,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit || "unit",
        bundle_key: line.bundle_key ?? null,
        bundle_components: line.bundle_components,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per document, never again on a refetch
  }, [existingNote, isEdit, lastResetNoteId]);

  const handleProductSelect = (index: number, productId: string) => {
    setValue(`lines.${index}.variant_id`, null);
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setValue(`lines.${index}.description`, product.designation);
      setValue(`lines.${index}.unit`, product.unit);
      // A pack brings its composition along; anything else clears it.
      setValue(`lines.${index}.bundle_key`, null);
      setValue(`lines.${index}.bundle_components`, catalog.packComponents(productId, null));
    }
  };

  const handleVariantSelect = (index: number, variantId: string) => {
    const productId = watchedLines[index]?.product_id;
    const values = productId ? catalog.variantLine(productId, variantId) : null;
    setValue(`lines.${index}.variant_id`, variantId || null, { shouldDirty: true });
    if (values) {
      setValue(`lines.${index}.description`, values.description);
      // A pack's variant has its own composition.
      setValue(`lines.${index}.bundle_components`, values.bundle_components);
    }
  };

  const onSubmit = async (data: DeliveryNoteFormData & { status?: DeliveryNoteStatus }) => {
    if (isDemoMode) { showSubscribePrompt(); return; }
    if (hasMissingVariant || hasStockErrors) return;
    try {
      // Transform empty strings to null for optional fields
      const input = {
        ...data,
        quote_id: data.quote_id || null,
        invoice_id: data.invoice_id || null,
        delivery_date: data.delivery_date || null,
        delivery_address: data.delivery_address || null,
        notes: data.notes || null,
        // Each pack goes out as its header plus its components, quantities only.
        lines: expandEditorLines(
          data.lines.map((line) => ({
            ...line,
            product_id: line.product_id || null,
            variant_id: line.variant_id || null,
            unit: line.unit || null,
          })),
          { priced: false }
        ),
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

  // Below lg the four-column grid stacks into a column per line; the phone
  // editor replaces it rather than sitting beside it.
  const isNarrow = useIsNarrow();

  const productOptions = catalog.productOptions(t("delivery:selectProduct"));

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
        <Button variant="ghost" size="sm" onClick={() => blocker.guard(() => router.push("/delivery-notes"))}>
          <ArrowLeft className="h-4 w-4 me-2" />
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
            {/* Only while creating: an existing note is labelled from its own
                page, the same way an issued invoice is. */}
            {!isEdit && (
              <div className="mt-4">
                <Controller
                  name="tag_ids"
                  control={control}
                  render={({ field }) => (
                    <TagPicker
                      value={field.value ?? []}
                      onChange={field.onChange}
                      onManage={() => setTagsModalOpen(true)}
                    />
                  )}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("delivery:lines.title")}</CardTitle>
              {/* The phone editor carries its own add button under the list. */}
              {!isNarrow && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  append({ description: "", quantity: 1, unit: "unit", product_id: null }) 
                }
              >
                <Plus className="h-4 w-4 me-2" />
                {t("delivery:lines.addLine")}
              </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isNarrow ? (
              <DocumentLinesMobile
                ns="delivery"
                fields={fields}
                lines={watchedLines}
                register={register}
                errors={errors}
                productOptions={productOptions}
                onSelectProduct={(index, productId) => {
                  setValue(`lines.${index}.product_id`, productId || null);
                  if (productId) handleProductSelect(index, productId);
                }}
                onAdd={() =>
                  append({ description: "", quantity: 1, unit: "unit", product_id: null })
                }
                onRemove={remove}
                stockError={getStockError}
                variantOptions={catalog.variantOptions}
                onSelectVariant={handleVariantSelect}
                variantLabel={catalog.variantLabel}
                variantPlaceholder={catalog.variantPlaceholder}
                variantError={getVariantError}
                // A delivery note states what left the shelf, not what it costs.
                withPricing={false}
              />
            ) : (
              <>
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
                      aria-label={t("common:buttons.delete")}
                      className="-me-2 rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
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
                  {catalog.variantOptions(watchedLines[index]?.product_id).length > 0 && (
                    <SearchableSelect
                      label={`${catalog.variantLabel} *`}
                      options={catalog.variantOptions(watchedLines[index]?.product_id)}
                      value={watchedLines[index]?.variant_id || ""}
                      onChange={(val) => handleVariantSelect(index, val)}
                      placeholder={catalog.variantPlaceholder}
                      error={getVariantError(index) ?? undefined}
                    />
                  )}
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
                {!!watchedLines[index]?.bundle_components?.length && (
                  <BundleContents
                    components={watchedLines[index]?.bundle_components ?? []}
                    quantity={watchedLines[index]?.quantity}
                  />
                )}
              </div>
            ))}
            {errors.lines?.message && (
              <p className="text-sm text-red-500">{errors.lines.message}</p>
            )}
              </>
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
        {/* Pinned at every width: with the save button several screens down,
            the Back button at the top was the one in reach. */}
        <FormActionBar>
          <Button
            type="button"
            variant="secondary"
            onClick={() => blocker.guard(() => router.push("/delivery-notes"))}
            className="flex-1 sm:flex-none"
          >
            {t("common:buttons.cancel")}
          </Button>
          <Button
            type="submit"
            isLoading={createDeliveryNote.isPending || updateDeliveryNote.isPending}
            disabled={hasStockErrors || hasMissingVariant}
            className="flex-1 sm:flex-none"
          >
            {isEdit ? t("common:buttons.save") : t("delivery:createDeliveryNote")}
          </Button>
        </FormActionBar>
      </form>
      <UnsavedChangesDialog isBlocked={blocker.isBlocked} onProceed={blocker.proceed} onReset={blocker.reset} />
      {/* Outside the form: a label created here must not submit the note. */}
      <TagsModal isOpen={tagsModalOpen} onClose={() => setTagsModalOpen(false)} canEdit />
    </div>
  );
}
