import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Textarea } from "@/components/ui";
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
    formState: { errors },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      address: supplier?.address ?? "",
      notes: supplier?.notes ?? "",
    },
  });

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

      <Textarea
        label={t("fields.notes")}
        autoComplete="off"
        {...register("notes")}
        error={errors.notes?.message}
      />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {supplier ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
