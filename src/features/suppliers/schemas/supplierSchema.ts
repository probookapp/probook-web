import { z } from "zod";

export const createSupplierSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("suppliers:validation.nameRequired")),
  email: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || val.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      { message: t("suppliers:validation.emailInvalid") }
    ),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // What stood between the business and the supplier before the app, entered
  // as an unsigned amount and a direction: a minus sign is easy to miss.
  opening_amount: z
    .string()
    .optional()
    .refine((val) => !val || (Number.isFinite(Number(val)) && Number(val) >= 0), {
      message: t("suppliers:validation.amountInvalid"),
    }),
  opening_direction: z.enum(["owe", "credit"]),
});

export type SupplierFormData = z.output<ReturnType<typeof createSupplierSchema>>;
