import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "@/components/ui";
import { formatDateISO } from "@/lib/utils";

export type PaymentFormData = {
  amount: number;
  payment_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
};

interface PaymentFormProps {
  maxAmount?: number;
  onSubmit: (data: PaymentFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PaymentForm({
  maxAmount,
  onSubmit,
  onCancel,
  isLoading,
}: PaymentFormProps) {
  const { t } = useTranslation("common");

  const paymentSchema = z.object({
    amount: z.coerce.number().min(0.01, t("payments.validation.amountPositive")),
    payment_date: z.string().min(1, t("payments.validation.dateRequired")),
    payment_method: z.string().min(1, t("payments.validation.methodRequired")),
    reference: z.string().optional(),
    notes: z.string().optional(),
  });

  const paymentMethodOptions = [
    { value: "", label: t("payments.selectMethod") },
    { value: "virement", label: t("payments.methods.transfer") },
    { value: "cheque", label: t("payments.methods.check") },
    { value: "carte", label: t("payments.methods.card") },
    { value: "especes", label: t("payments.methods.cash") },
    { value: "prelevement", label: t("payments.methods.directDebit") },
    { value: "autre", label: t("payments.methods.other") },
  ];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormData>,
    defaultValues: {
      amount: maxAmount || 0,
      payment_date: formatDateISO(new Date()),
      payment_method: "",
      reference: "",
      notes: "",
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label={t("payments.amount")}
          type="number"
          step="0.01"
          {...register("amount")}
          error={errors.amount?.message}
        />
        <Input
          label={t("payments.date")}
          type="date"
          {...register("payment_date")}
          error={errors.payment_date?.message}
        />
      </div>

      <Select
        label={t("payments.method")}
        options={paymentMethodOptions}
        {...register("payment_method")}
        error={errors.payment_method?.message}
      />

      <Input
        label={t("payments.reference")}
        placeholder={t("payments.referencePlaceholder")}
        {...register("reference")}
        error={errors.reference?.message}
      />

      <Input
        label={t("labels.notes")}
        placeholder={t("payments.notesPlaceholder")}
        {...register("notes")}
        error={errors.notes?.message}
      />

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("buttons.cancel")}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {t("payments.savePayment")}
        </Button>
      </div>
    </form>
  );
}
