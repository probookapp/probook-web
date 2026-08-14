import { z } from "zod";
import { EXPENSE_CATEGORY_MAX_LENGTH } from "@/lib/expense-categories";

export const createExpenseSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("expenses:validation.nameRequired")),
  amount: z.coerce.number().min(0, t("expenses:validation.amountPositive")),
  date: z.string().min(1, t("expenses:validation.dateRequired")),
  notes: z.string().nullable().optional(),
  // One field for both picking an existing heading and inventing a new one —
  // the server decides which it was.
  category_name: z
    .string()
    .max(EXPENSE_CATEGORY_MAX_LENGTH, t("expenses:validation.categoryTooLong"))
    .nullable()
    .optional(),
});

export type ExpenseFormData = z.output<ReturnType<typeof createExpenseSchema>>;
