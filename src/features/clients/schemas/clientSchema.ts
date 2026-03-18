import { z } from "zod";

export const createClientSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("validation.nameRequired")),
  email: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || val.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      { message: t("validation.emailInvalid") }
    ),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  siret: z.string().nullable().optional(),
  vat_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type ClientFormData = z.infer<ReturnType<typeof createClientSchema>>;
