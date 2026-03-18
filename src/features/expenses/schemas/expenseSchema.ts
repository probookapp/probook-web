import { z } from "zod";

export const createExpenseSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("expenses:validation.nameRequired")),
  amount: z.coerce.number().min(0, t("expenses:validation.amountPositive")),
  date: z.string().min(1, t("expenses:validation.dateRequired")),
  notes: z.string().nullable().optional(),
});

export type ExpenseFormData = z.output<ReturnType<typeof createExpenseSchema>>;
