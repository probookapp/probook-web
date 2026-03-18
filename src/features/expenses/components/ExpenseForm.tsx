import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Textarea } from "@/components/ui";
import { createExpenseSchema, type ExpenseFormData } from "../schemas/expenseSchema";
import { formatDateISO } from "@/lib/utils";
import type { Expense } from "@/types";

interface ExpenseFormProps {
  expense?: Expense;
  onSubmit: (data: ExpenseFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ExpenseForm({ expense, onSubmit, onCancel, isLoading }: ExpenseFormProps) {
  const { t } = useTranslation("expenses");
  const { t: tCommon } = useTranslation("common");
  const expenseSchema = createExpenseSchema(t);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema) as Resolver<ExpenseFormData>,
    defaultValues: {
      name: expense?.name ?? "",
      amount: expense?.amount ?? 0,
      date: expense?.date ?? formatDateISO(new Date()),
      notes: expense?.notes ?? "",
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
          label={t("fields.amountRequired")}
          type="number"
          step="0.01"
          autoComplete="off"
          {...register("amount")}
          error={errors.amount?.message}
        />
      </div>

      <Input
        label={t("fields.dateRequired")}
        type="date"
        autoComplete="off"
        {...register("date")}
        error={errors.date?.message}
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
          {expense ? tCommon("buttons.save") : tCommon("buttons.create")}
        </Button>
      </div>
    </form>
  );
}
