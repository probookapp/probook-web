import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button, Input, Select } from "@/components/ui";
import { formatDateISO } from "@/lib/utils";
import { stampDutyApplies } from "@/lib/stamp-duty";
import { isCheque } from "@/lib/cheque-mentions";
import { useCompanySettings } from "@/features/settings/hooks/useSettings";

export type PaymentFormData = {
  amount: number;
  payment_date: string;
  payment_method: string;
  reference?: string;
  cheque_date?: string;
  cheque_number?: string;
  cheque_bank?: string;
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
  const { data: settings } = useCompanySettings();

  // Article 258 exempts a cheque-settled receipt only if the receipt states the
  // cheque's date, its number and the drawee. Asked for only where a duty could
  // otherwise arise — a business outside that regime, or one that has not turned
  // the duty on, is owed none of this paperwork and keeps the plain reference box.
  const chequeMentionsRequired = stampDutyApplies({
    fiscalProfile: settings?.fiscal_profile,
    stampDutyEnabled: settings?.stamp_duty_enabled,
  });

  const paymentSchema = z
    .object({
      amount: z.coerce.number().min(0.01, t("payments.validation.amountPositive")),
      payment_date: z.string().min(1, t("payments.validation.dateRequired")),
      payment_method: z.string().min(1, t("payments.validation.methodRequired")),
      reference: z.string().optional(),
      cheque_date: z.string().optional(),
      cheque_number: z.string().optional(),
      cheque_bank: z.string().optional(),
      notes: z.string().optional(),
    })
    // Only a cheque carries the requirement, so the rule is checked against the
    // method actually chosen rather than field by field.
    .superRefine((data, ctx) => {
      if (!chequeMentionsRequired || !isCheque(data.payment_method)) return;
      for (const field of ["cheque_date", "cheque_number", "cheque_bank"] as const) {
        if (!data[field]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: t("payments.validation.chequeMentionRequired"),
          });
        }
      }
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
    control,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema) as Resolver<PaymentFormData>,
    defaultValues: {
      amount: maxAmount || 0,
      payment_date: formatDateISO(new Date()),
      payment_method: "",
      reference: "",
      cheque_date: "",
      cheque_number: "",
      cheque_bank: "",
      notes: "",
    },
  });

  // useWatch, not watch(): the latter hands back a fresh function each render,
  // which makes React Compiler skip memoising the whole component.
  const paymentMethod = useWatch({ control, name: "payment_method" });
  const showChequeMentions = chequeMentionsRequired && isCheque(paymentMethod);

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

      {!showChequeMentions && (
        <Input
          label={t("payments.reference")}
          placeholder={t("payments.referencePlaceholder")}
          {...register("reference")}
          error={errors.reference?.message}
        />
      )}

      {showChequeMentions && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t("payments.chequeDate")}
              type="date"
              {...register("cheque_date")}
              error={errors.cheque_date?.message}
            />
            <Input
              label={t("payments.chequeNumber")}
              {...register("cheque_number")}
              error={errors.cheque_number?.message}
            />
          </div>
          <Input
            label={t("payments.chequeBank")}
            {...register("cheque_bank")}
            error={errors.cheque_bank?.message}
          />
          <p className="text-xs text-(--color-text-secondary)">
            {t("payments.chequeMentionsHint")}
          </p>
        </div>
      )}

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
