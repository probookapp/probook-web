import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateBody, isValidationError } from "@/lib/validate";
import { importBackupSchema } from "@/lib/validations";

export const POST = withAdmin(async (req: NextRequest, ctx) => {
  const { tenantId } = ctx;

  const body = await validateBody(req, importBackupSchema);
  if (isValidationError(body)) return body;

  const imported: Record<string, number> = {};

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Delete all existing data for the tenant (order matters for FK constraints)
      await tx.reminder.deleteMany({ where: { tenantId } });
      await tx.clientContact.deleteMany({ where: { tenantId } });
      await tx.productSupplier.deleteMany({ where: { tenantId } });
      await tx.payment.deleteMany({ where: { tenantId } });
      await tx.deliveryNoteLine.deleteMany({
        where: { deliveryNote: { tenantId } },
      });
      await tx.deliveryNote.deleteMany({ where: { tenantId } });
      await tx.invoiceLine.deleteMany({ where: { invoice: { tenantId } } });
      await tx.invoice.deleteMany({ where: { tenantId } });
      await tx.quoteLine.deleteMany({ where: { quote: { tenantId } } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.expense.deleteMany({ where: { tenantId } });
      await tx.supplier.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.productCategory.deleteMany({ where: { tenantId } });
      await tx.client.deleteMany({ where: { tenantId } });
      // Delete non-admin user permissions
      await tx.userPermission.deleteMany({
        where: { user: { tenantId, role: { not: "admin" } } },
      });

      // 2. Import product categories
      const categories = body.product_categories as
        | Record<string, unknown>[]
        | undefined;
      if (categories?.length) {
        await tx.productCategory.createMany({
          data: categories.map((c) => ({
            id: c.id as string,
            tenantId,
            name: c.name as string,
            description: (c.description as string) || null,
            parentId: (c.parent_id as string) || null,
          })),
        });
        imported.product_categories = categories.length;
      }

      // 3. Import products
      const products = body.products as Record<string, unknown>[] | undefined;
      if (products?.length) {
        await tx.product.createMany({
          data: products.map((p) => ({
            id: p.id as string,
            tenantId,
            designation: p.designation as string,
            description: (p.description as string) || null,
            descriptionHtml: (p.description_html as string) || null,
            unitPrice: (p.unit_price as number) || 0,
            taxRate: (p.tax_rate as number) ?? 20,
            unit: (p.unit as string) || "unit",
            reference: (p.reference as string) || null,
            barcode: (p.barcode as string) || null,
            isService: (p.is_service as boolean) || false,
            categoryId: (p.category_id as string) || null,
            quantity: (p.quantity as number) ?? 0,
            purchasePrice: (p.purchase_price as number) ?? 0,
          })),
        });
        imported.products = products.length;
      }

      // 4. Import clients
      const clients = body.clients as Record<string, unknown>[] | undefined;
      if (clients?.length) {
        await tx.client.createMany({
          data: clients.map((c) => ({
            id: c.id as string,
            tenantId,
            name: c.name as string,
            email: (c.email as string) || null,
            phone: (c.phone as string) || null,
            address: (c.address as string) || null,
            city: (c.city as string) || null,
            postalCode: (c.postal_code as string) || null,
            country: (c.country as string) || null,
            siret: (c.siret as string) || null,
            vatNumber: (c.vat_number as string) || null,
            notes: (c.notes as string) || null,
          })),
        });
        imported.clients = clients.length;
      }

      // 5. Import client contacts
      const contacts = body.client_contacts as
        | Record<string, unknown>[]
        | undefined;
      if (contacts?.length) {
        await tx.clientContact.createMany({
          data: contacts.map((c) => ({
            id: c.id as string,
            tenantId,
            clientId: c.client_id as string,
            name: c.name as string,
            role: (c.role as string) || null,
            email: (c.email as string) || null,
            phone: (c.phone as string) || null,
            isPrimary: (c.is_primary as boolean) || false,
          })),
        });
        imported.client_contacts = contacts.length;
      }

      // 6. Import suppliers
      const suppliers = body.suppliers as
        | Record<string, unknown>[]
        | undefined;
      if (suppliers?.length) {
        await tx.supplier.createMany({
          data: suppliers.map((s) => ({
            id: s.id as string,
            tenantId,
            name: s.name as string,
            email: (s.email as string) || null,
            phone: (s.phone as string) || null,
            address: (s.address as string) || null,
            notes: (s.notes as string) || null,
          })),
        });
        imported.suppliers = suppliers.length;
      }

      // 7. Import product suppliers
      const productSuppliers = body.product_suppliers as
        | Record<string, unknown>[]
        | undefined;
      if (productSuppliers?.length) {
        await tx.productSupplier.createMany({
          data: productSuppliers.map((ps) => ({
            id: ps.id as string,
            tenantId,
            productId: ps.product_id as string,
            supplierId: ps.supplier_id as string,
            purchasePrice: (ps.purchase_price as number) || 0,
          })),
        });
        imported.product_suppliers = productSuppliers.length;
      }

      // 8. Import quotes with lines
      const quotes = body.quotes as Record<string, unknown>[] | undefined;
      if (quotes?.length) {
        for (const q of quotes) {
          const lines = (q.lines as Record<string, unknown>[]) || [];
          await tx.quote.create({
            data: {
              id: q.id as string,
              tenantId,
              quoteNumber: q.quote_number as string,
              clientId: q.client_id as string,
              status: (q.status as string) || "DRAFT",
              issueDate: new Date(q.issue_date as string),
              validityDate: new Date(q.validity_date as string),
              subtotal: (q.subtotal as number) || 0,
              taxAmount: (q.tax_amount as number) || 0,
              total: (q.total as number) || 0,
              notes: (q.notes as string) || null,
              notesHtml: (q.notes_html as string) || null,
              shippingCost: (q.shipping_cost as number) || 0,
              shippingTaxRate: (q.shipping_tax_rate as number) ?? 20,
              downPaymentPercent: (q.down_payment_percent as number) || 0,
              downPaymentAmount: (q.down_payment_amount as number) || 0,
              lines: {
                createMany: {
                  data: lines.map((l) => ({
                    id: l.id as string,
                    productId: (l.product_id as string) || null,
                    description: l.description as string,
                    descriptionHtml: (l.description_html as string) || null,
                    quantity: (l.quantity as number) || 0,
                    unitPrice: (l.unit_price as number) || 0,
                    taxRate: (l.tax_rate as number) || 0,
                    subtotal: (l.subtotal as number) || 0,
                    taxAmount: (l.tax_amount as number) || 0,
                    total: (l.total as number) || 0,
                    position: (l.position as number) || 0,
                    groupName: (l.group_name as string) || null,
                    isSubtotalLine: (l.is_subtotal_line as boolean) || false,
                  })),
                },
              },
            },
          });
        }
        imported.quotes = quotes.length;
      }

      // 9. Import invoices with lines
      const invoices = body.invoices as Record<string, unknown>[] | undefined;
      if (invoices?.length) {
        for (const inv of invoices) {
          const lines = (inv.lines as Record<string, unknown>[]) || [];
          await tx.invoice.create({
            data: {
              id: inv.id as string,
              tenantId,
              invoiceNumber: inv.invoice_number as string,
              clientId: inv.client_id as string,
              quoteId: (inv.quote_id as string) || null,
              status: (inv.status as string) || "DRAFT",
              issueDate: new Date(inv.issue_date as string),
              dueDate: new Date(inv.due_date as string),
              subtotal: (inv.subtotal as number) || 0,
              taxAmount: (inv.tax_amount as number) || 0,
              total: (inv.total as number) || 0,
              notes: (inv.notes as string) || null,
              notesHtml: (inv.notes_html as string) || null,
              integrityHash: (inv.integrity_hash as string) || null,
              shippingCost: (inv.shipping_cost as number) || 0,
              shippingTaxRate: (inv.shipping_tax_rate as number) ?? 20,
              downPaymentPercent: (inv.down_payment_percent as number) || 0,
              downPaymentAmount: (inv.down_payment_amount as number) || 0,
              isDownPaymentInvoice:
                (inv.is_down_payment_invoice as boolean) || false,
              parentQuoteId: (inv.parent_quote_id as string) || null,
              lines: {
                createMany: {
                  data: lines.map((l) => ({
                    id: l.id as string,
                    productId: (l.product_id as string) || null,
                    description: l.description as string,
                    descriptionHtml: (l.description_html as string) || null,
                    quantity: (l.quantity as number) || 0,
                    unitPrice: (l.unit_price as number) || 0,
                    taxRate: (l.tax_rate as number) || 0,
                    subtotal: (l.subtotal as number) || 0,
                    taxAmount: (l.tax_amount as number) || 0,
                    total: (l.total as number) || 0,
                    position: (l.position as number) || 0,
                    groupName: (l.group_name as string) || null,
                    isSubtotalLine: (l.is_subtotal_line as boolean) || false,
                  })),
                },
              },
            },
          });
        }
        imported.invoices = invoices.length;
      }

      // 10. Import payments
      const payments = body.payments as Record<string, unknown>[] | undefined;
      if (payments?.length) {
        await tx.payment.createMany({
          data: payments.map((p) => ({
            id: p.id as string,
            tenantId,
            invoiceId: p.invoice_id as string,
            amount: (p.amount as number) || 0,
            paymentDate: new Date(p.payment_date as string),
            paymentMethod: p.payment_method as string,
            reference: (p.reference as string) || null,
            notes: (p.notes as string) || null,
          })),
        });
        imported.payments = payments.length;
      }

      // 11. Import delivery notes with lines
      const deliveryNotes = body.delivery_notes as
        | Record<string, unknown>[]
        | undefined;
      if (deliveryNotes?.length) {
        for (const dn of deliveryNotes) {
          const lines = (dn.lines as Record<string, unknown>[]) || [];
          await tx.deliveryNote.create({
            data: {
              id: dn.id as string,
              tenantId,
              deliveryNoteNumber: dn.delivery_note_number as string,
              clientId: dn.client_id as string,
              quoteId: (dn.quote_id as string) || null,
              invoiceId: (dn.invoice_id as string) || null,
              status: (dn.status as string) || "DRAFT",
              issueDate: new Date(dn.issue_date as string),
              deliveryDate: dn.delivery_date
                ? new Date(dn.delivery_date as string)
                : null,
              deliveryAddress: (dn.delivery_address as string) || null,
              notes: (dn.notes as string) || null,
              notesHtml: (dn.notes_html as string) || null,
              lines: {
                createMany: {
                  data: lines.map((l) => ({
                    id: l.id as string,
                    productId: (l.product_id as string) || null,
                    description: l.description as string,
                    descriptionHtml: (l.description_html as string) || null,
                    quantity: (l.quantity as number) || 0,
                    unit: (l.unit as string) || null,
                    position: (l.position as number) || 0,
                  })),
                },
              },
            },
          });
        }
        imported.delivery_notes = deliveryNotes.length;
      }

      // 12. Import expenses
      const expenses = body.expenses as Record<string, unknown>[] | undefined;
      if (expenses?.length) {
        await tx.expense.createMany({
          data: expenses.map((e) => ({
            id: e.id as string,
            tenantId,
            name: e.name as string,
            amount: (e.amount as number) || 0,
            date: new Date(e.date as string),
            notes: (e.notes as string) || null,
          })),
        });
        imported.expenses = expenses.length;
      }

      // 13. Import reminders
      const reminders = body.reminders as
        | Record<string, unknown>[]
        | undefined;
      if (reminders?.length) {
        await tx.reminder.createMany({
          data: reminders.map((r) => ({
            id: r.id as string,
            tenantId,
            reminderType: r.reminder_type as string,
            documentType: r.document_type as string,
            documentId: r.document_id as string,
            scheduledDate: new Date(r.scheduled_date as string),
            sentAt: r.sent_at ? new Date(r.sent_at as string) : null,
            message: (r.message as string) || null,
          })),
        });
        imported.reminders = reminders.length;
      }

      // 14. Update company settings if included
      const settings = body.settings as Record<string, unknown> | undefined;
      if (settings) {
        await tx.companySettings.upsert({
          where: { tenantId },
          update: {
            companyName: (settings.company_name as string) || undefined,
            address: (settings.address as string) || undefined,
            city: (settings.city as string) || undefined,
            postalCode: (settings.postal_code as string) || undefined,
            country: (settings.country as string) || undefined,
            phone: (settings.phone as string) || undefined,
            email: (settings.email as string) || undefined,
            website: (settings.website as string) || undefined,
            siret: (settings.siret as string) || undefined,
            vatNumber: (settings.vat_number as string) || undefined,
            defaultTaxRate: settings.default_tax_rate as number | undefined,
            defaultPaymentTerms: settings.default_payment_terms as
              | number
              | undefined,
            invoicePrefix: (settings.invoice_prefix as string) || undefined,
            quotePrefix: (settings.quote_prefix as string) || undefined,
            legalMentions: (settings.legal_mentions as string) || undefined,
            legalMentionsHtml:
              (settings.legal_mentions_html as string) || undefined,
            bankDetails: (settings.bank_details as string) || undefined,
            deliveryNotePrefix:
              (settings.delivery_note_prefix as string) || undefined,
            currency: (settings.currency as string) || undefined,
          },
          create: {
            tenantId,
            companyName:
              (settings.company_name as string) || "My Company",
          },
        });
        imported.settings = 1;
      }
    });

    return NextResponse.json({ success: true, imported });
  } catch (error) {
    console.error("Backup import error:", error);
    const message =
      error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
