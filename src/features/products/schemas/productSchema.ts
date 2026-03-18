import { z } from "zod";

export const createProductSchema = (t: (key: string) => string) => z.object({
  designation: z.string().min(1, t("products:validation.designationRequired")),
  description: z.string().nullable().optional(),
  unit_price: z.coerce.number().min(0, t("products:validation.pricePositive")),
  tax_rate: z.coerce.number().min(0).max(100, t("products:validation.vatRateRange")),
  unit: z.string().min(1, t("products:validation.unitRequired")),
  reference: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  is_service: z.boolean(),
  category_id: z.string().nullable().optional(),
  quantity: z.coerce.number().int().min(0).nullable().optional(),
  purchase_price: z.coerce.number().min(0).nullable().optional(),
});

export type ProductFormData = z.output<ReturnType<typeof createProductSchema>>;

export const createProductCategorySchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t("products:validation.categoryNameRequired")),
  description: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional(),
});

export type ProductCategoryFormData = z.output<ReturnType<typeof createProductCategorySchema>>;
