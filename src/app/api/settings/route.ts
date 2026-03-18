import { NextResponse } from "next/server";
import { withAuth, toSnakeCase, markOnboardingStep } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { settingsSchema } from "@/lib/validations";

export const GET = withAuth(async (req, { tenantId }) => {
  let settings = await prisma.companySettings.findFirst({ where: { tenantId } });
  if (!settings) {
    settings = await prisma.companySettings.create({ data: { tenantId } });
  }
  return NextResponse.json(toSnakeCase(settings));
});

export const PUT = withAuth(async (req, { tenantId }) => {
  const body = await validateBody(req, settingsSchema);
  if (isValidationError(body)) return body;

  const updateData: Record<string, unknown> = {};
  if (body.company_name !== undefined) updateData.companyName = body.company_name;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.city !== undefined) updateData.city = body.city;
  if (body.postal_code !== undefined) updateData.postalCode = body.postal_code;
  if (body.country !== undefined) updateData.country = body.country;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.website !== undefined) updateData.website = body.website;
  if (body.siret !== undefined) updateData.siret = body.siret;
  if (body.vat_number !== undefined) updateData.vatNumber = body.vat_number;
  if (body.logo_path !== undefined) updateData.logoPath = body.logo_path;
  if (body.default_tax_rate !== undefined) updateData.defaultTaxRate = body.default_tax_rate;
  if (body.default_payment_terms !== undefined) updateData.defaultPaymentTerms = body.default_payment_terms;
  if (body.invoice_prefix !== undefined) updateData.invoicePrefix = body.invoice_prefix;
  if (body.quote_prefix !== undefined) updateData.quotePrefix = body.quote_prefix;
  if (body.next_invoice_number !== undefined) updateData.nextInvoiceNumber = body.next_invoice_number;
  if (body.next_quote_number !== undefined) updateData.nextQuoteNumber = body.next_quote_number;
  if (body.legal_mentions !== undefined) updateData.legalMentions = body.legal_mentions;
  if (body.legal_mentions_html !== undefined) updateData.legalMentionsHtml = body.legal_mentions_html;
  if (body.bank_details !== undefined) updateData.bankDetails = body.bank_details;
  if (body.delivery_note_prefix !== undefined) updateData.deliveryNotePrefix = body.delivery_note_prefix;
  if (body.next_delivery_note_number !== undefined) updateData.nextDeliveryNoteNumber = body.next_delivery_note_number;
  if (body.currency !== undefined) updateData.currency = body.currency;

  const settings = await prisma.companySettings.upsert({
    where: { tenantId },
    update: updateData,
    create: { tenantId, ...updateData },
  });

  markOnboardingStep(tenantId, "company_setup");
  return NextResponse.json(toSnakeCase(settings));
});
