import { useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Input, Textarea } from "@/components/ui";
import { createExpenseSchema, type ExpenseFormData } from "../schemas/expenseSchema";
import { formatDateISO } from "@/lib/utils";
import { expenseCategoryApi } from "@/lib/api";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/expense-categories";
import { useDemoMode } from "@/components/providers/DemoModeProvider";
import { DEMO_EXPENSE_CATEGORIES } from "@/lib/demo-data";
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
  const { isDemoMode } = useDemoMode();
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
      category_name: expense?.category?.name ?? "",
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["expense-categories", { demo: isDemoMode }],
    queryFn: isDemoMode ? () => DEMO_EXPENSE_CATEGORIES : () => expenseCategoryApi.getAll(),
    staleTime: isDemoMode ? Infinity : undefined,
  });

  // The headings this tenant already uses come first; the translated suggestions
  // fill in the rest, so a brand-new account is not offered an empty list.
  const options = useMemo(() => {
    const used = (categories ?? []).map((c) => c.name);
    const usedLower = new Set(used.map((n) => n.toLowerCase()));
    const suggested = EXPENSE_CATEGORY_SUGGESTIONS.map((key) => t(`suggestions.${key}`)).filter(
      (label) => !usedLower.has(label.toLowerCase())
    );
    return [...used, ...suggested];
  }, [categories, t]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.dateRequired")}
          type="date"
          autoComplete="off"
          {...register("date")}
          error={errors.date?.message}
        />
        {/* A datalist rather than a select: picking a known heading and typing a
            new one are the same gesture, and a new one is created on save. */}
        <div>
          <Input
            label={t("fields.category")}
            list="expense-category-options"
            autoComplete="off"
            placeholder={t("fields.categoryPlaceholder")}
            {...register("category_name")}
            error={errors.category_name?.message}
          />
          <datalist id="expense-category-options">
            {options.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t("fields.categoryHint")}</p>
        </div>
      </div>

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
