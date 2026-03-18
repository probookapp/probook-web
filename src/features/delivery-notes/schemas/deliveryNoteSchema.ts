import { z } from "zod";

export const createDeliveryNoteLineSchema = (t: (key: string) => string) => z.object({
  product_id: z.string().nullable().optional(),
  description: z.string().min(1, t("validation.descriptionRequired")),
  quantity: z.coerce.number().min(0.01, t("validation.quantityPositive")),
  unit: z.string().nullable().optional(),
});

export const createDeliveryNoteSchema = (t: (key: string) => string) => z.object({
  client_id: z.string().min(1, t("validation.clientRequired")),
  quote_id: z.string().nullable().optional(),
  invoice_id: z.string().nullable().optional(),
  issue_date: z.string().min(1, t("validation.issueDateRequired")),
  delivery_date: z.string().nullable().optional(),
  delivery_address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(createDeliveryNoteLineSchema(t)).min(1, t("validation.atLeastOneLine")),
});

export type DeliveryNoteFormData = z.output<ReturnType<typeof createDeliveryNoteSchema>>;
export type DeliveryNoteLineFormData = z.output<ReturnType<typeof createDeliveryNoteLineSchema>>;
