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
});

export type SupplierFormData = z.output<ReturnType<typeof createSupplierSchema>>;
