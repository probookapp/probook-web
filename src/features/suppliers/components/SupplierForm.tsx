import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Select, Textarea, ModalFooter, useModalDirty } from "@/components/ui";
import { createSupplierSchema, type SupplierFormData } from "../schemas/supplierSchema";
import type { Supplier } from "@/types";

interface SupplierFormProps {
  supplier?: Supplier;
  onSubmit: (data: SupplierFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function SupplierForm({ supplier, onSubmit, onCancel, isLoading }: SupplierFormProps) {
  const { t } = useTranslation("suppliers");
  const { t: tCommon } = useTranslation("common");
  const supplierSchema = createSupplierSchema(t);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      address: supplier?.address ?? "",
      notes: supplier?.notes ?? "",
      opening_amount: supplier?.opening_balance ? String(Math.abs(supplier.opening_balance)) : "",
      opening_direction: (supplier?.opening_balance ?? 0) < 0 ? "credit" : "owe",
    },
  });

  // Inside a modal, a stray click on the backdrop must not throw the input away.
  useModalDirty(isDirty);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.nameRequired")}
          autoComplete="off"
          {...register("name")}
          error={errors.name?.message}
        />
        <Input
          label={t("fields.email")}
          type="email"
          autoComplete="off"
          {...register("email")}
          error={errors.email?.message}
        />
      </div>

      <Input
        label={t("fields.phone")}
        autoComplete="off"
        {...register("phone")}
        error={errors.phone?.message}
      />

      <Textarea
        label={t("fields.address")}
        autoComplete="off"
        {...register("address")}
        error={errors.address?.message}
      />

      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("fields.openingBalance")}
            type="number"
            min="0"
            step="0.01"
            autoComplete="off"
            {...register("opening_amount")}
            error={errors.opening_amount?.message}
          />
          <Select
            label={t("fields.openingDirection")}
            {...register("opening_direction")}
            options={[
              { value: "owe", label: t("direction.owe") },
              { value: "credit", label: t("direction.credit") },
            ]}
          />
        </div>
        <p className="mt-1 text-xs text-(--color-text-secondary)">{t("fields.openingBalanceHint")}</p>
      </div>

      <Textarea
        label={t("fields.notes")}
        autoComplete="off"
        {...register("notes")}
        error={errors.notes?.message}
      />

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {supplier ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </ModalFooter>
    </form>
  );
}
