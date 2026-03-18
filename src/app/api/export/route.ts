import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export const GET = withAdmin(async (req, { tenantId }) => {
  const [
    clients,
    products,
    productCategories,
    quotes,
    invoices,
    payments,
    deliveryNotes,
    expenses,
    suppliers,
    productSuppliers,
    clientContacts,
    reminders,
    users,
    userPermissions,
    settings,
  ] = await Promise.all([
    prisma.client.findMany({ where: { tenantId } }),
    prisma.product.findMany({ where: { tenantId } }),
    prisma.productCategory.findMany({ where: { tenantId } }),
    prisma.quote.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.invoice.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.payment.findMany({ where: { tenantId } }),
    prisma.deliveryNote.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { position: "asc" } } },
    }),
    prisma.expense.findMany({ where: { tenantId } }),
    prisma.supplier.findMany({ where: { tenantId } }),
    prisma.productSupplier.findMany({ where: { tenantId } }),
    prisma.clientContact.findMany({ where: { tenantId } }),
    prisma.reminder.findMany({ where: { tenantId } }),
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // passwordHash intentionally excluded
      },
    }),
    prisma.userPermission.findMany({
      where: { user: { tenantId } },
    }),
    prisma.companySettings.findFirst({ where: { tenantId } }),
  ]);

  // Strip base64 photo data from products to keep export lean
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const productsClean = products.map(({ photoPath, ...rest }) => rest);

  // Strip logo base64 from settings
  const settingsClean = settings
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ? (({ logoPath, ...rest }) => rest)(settings)
    : null;

  const backup = {
    version: "2.0",
    created_at: new Date().toISOString(),
    clients,
    products: productsClean,
    product_categories: productCategories,
    quotes,
    invoices,
    payments,
    delivery_notes: deliveryNotes,
    expenses,
    suppliers,
    product_suppliers: productSuppliers,
    client_contacts: clientContacts,
    reminders,
    users,
    user_permissions: userPermissions,
    settings: settingsClean,
  };

  const json = JSON.stringify(backup, null, 2);

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="probook-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
