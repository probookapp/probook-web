import { NextResponse } from "next/server";
import { withAuth, toSnakeCase } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import {
  sendEmail,
  isResendConfigured,
  paymentOverdueEmail,
  quoteExpiringEmail,
  paymentOverdueEmailPlainText,
  quoteExpiringEmailPlainText,
} from "@/lib/email";

export const POST = withAuth(async (req, { tenantId, params }) => {
  const reminder = await prisma.reminder.findFirst({
    where: { tenantId, id: params?.id },
  });

  if (!reminder) {
    return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
  }

  if (reminder.sentAt) {
    return NextResponse.json({ error: "Reminder already sent" }, { status: 400 });
  }

  const settings = await prisma.companySettings.findFirst({
    where: { tenantId },
  });
  const companyName = settings?.companyName || "My Company";
  const currency = settings?.currency || "EUR";

  let clientEmail: string | null = null;
  let emailContent: { subject: string; html: string };
  let plainTextContent: { subject: string; body: string };

  if (reminder.documentType === "invoice") {
    const invoice = await prisma.invoice.findFirst({
      where: { tenantId, id: reminder.documentId },
      include: { client: true },
    });

    if (!invoice?.client?.email) {
      return NextResponse.json(
        { error: "Client has no email address" },
        { status: 400 },
      );
    }

    clientEmail = invoice.client.email;
    const templateParams = {
      companyName,
      clientName: invoice.client.name,
      invoiceNumber: invoice.invoiceNumber,
      total: Number(invoice.total),
      currency,
      dueDate: invoice.dueDate
        ? invoice.dueDate.toISOString().split("T")[0]
        : "N/A",
    };
    emailContent = paymentOverdueEmail(templateParams);
    plainTextContent = paymentOverdueEmailPlainText(templateParams);
  } else if (reminder.documentType === "quote") {
    const quote = await prisma.quote.findFirst({
      where: { tenantId, id: reminder.documentId },
      include: { client: true },
    });

    if (!quote?.client?.email) {
      return NextResponse.json(
        { error: "Client has no email address" },
        { status: 400 },
      );
    }

    clientEmail = quote.client.email;
    const templateParams = {
      companyName,
      clientName: quote.client.name,
      quoteNumber: quote.quoteNumber,
      total: Number(quote.total),
      currency,
      validityDate: quote.validityDate
        ? quote.validityDate.toISOString().split("T")[0]
        : "N/A",
    };
    emailContent = quoteExpiringEmail(templateParams);
    plainTextContent = quoteExpiringEmailPlainText(templateParams);
  } else {
    return NextResponse.json(
      { error: `Unsupported document type: ${reminder.documentType}` },
      { status: 400 },
    );
  }

  // If Resend is configured, send via API. Otherwise return mailto: data.
  if (isResendConfigured()) {
    await sendEmail({
      to: clientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      replyTo: settings?.email || undefined,
    });

    const updated = await prisma.reminder.update({
      where: { id: reminder.id },
      data: { sentAt: new Date() },
    });

    return NextResponse.json(toSnakeCase(updated));
  } else {
    // Return mailto data for the frontend to open the user's email client
    return NextResponse.json({
      mode: "mailto",
      to: clientEmail,
      subject: plainTextContent.subject,
      body: plainTextContent.body,
    });
  }
});
