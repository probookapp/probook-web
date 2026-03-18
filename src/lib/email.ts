import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
  const resend = getResend();
  if (!resend) {
    throw new Error("RESEND_NOT_CONFIGURED");
  }
  const fromEmail = process.env.EMAIL_FROM || "Probook <noreply@resend.dev>";
  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
    replyTo,
  });

  if (error) {
    throw new Error(`Email send failed: ${error.message}`);
  }
}

// Plain text versions for mailto: fallback
export function paymentOverdueEmailPlainText(params: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string;
}) {
  const subject = `Payment reminder – Invoice ${params.invoiceNumber}`;
  const body = `Dear ${params.clientName},

This is a friendly reminder that the following invoice is past due:

Invoice: ${params.invoiceNumber}
Amount: ${params.total.toFixed(2)} ${params.currency}
Due Date: ${params.dueDate}

Please arrange payment at your earliest convenience.

Best regards,
${params.companyName}`;
  return { subject, body };
}

export function quoteExpiringEmailPlainText(params: {
  companyName: string;
  clientName: string;
  quoteNumber: string;
  total: number;
  currency: string;
  validityDate: string;
}) {
  const subject = `Quote ${params.quoteNumber} expiring soon`;
  const body = `Dear ${params.clientName},

This is a reminder that the following quote will expire soon:

Quote: ${params.quoteNumber}
Amount: ${params.total.toFixed(2)} ${params.currency}
Valid Until: ${params.validityDate}

If you would like to proceed, please let us know before the expiry date.

Best regards,
${params.companyName}`;
  return { subject, body };
}

// ─── Email Templates ───

export function paymentOverdueEmail(params: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string;
}) {
  const subject = `Payment reminder – Invoice ${params.invoiceNumber}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Payment Reminder</h2>
      <p>Dear ${params.clientName},</p>
      <p>This is a friendly reminder that the following invoice is past due:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 8px 0; color: #666;">Invoice</td>
          <td style="padding: 8px 0; font-weight: bold;">${params.invoiceNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 8px 0; color: #666;">Amount</td>
          <td style="padding: 8px 0; font-weight: bold;">${params.total.toFixed(2)} ${params.currency}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Due Date</td>
          <td style="padding: 8px 0; font-weight: bold; color: #dc2626;">${params.dueDate}</td>
        </tr>
      </table>
      <p>Please arrange payment at your earliest convenience.</p>
      <p style="margin-top: 32px; color: #666; font-size: 14px;">
        Best regards,<br/>${params.companyName}
      </p>
    </div>
  `;
  return { subject, html };
}

export function quoteExpiringEmail(params: {
  companyName: string;
  clientName: string;
  quoteNumber: string;
  total: number;
  currency: string;
  validityDate: string;
}) {
  const subject = `Quote ${params.quoteNumber} expiring soon`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Quote Expiring Soon</h2>
      <p>Dear ${params.clientName},</p>
      <p>This is a reminder that the following quote will expire soon:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 8px 0; color: #666;">Quote</td>
          <td style="padding: 8px 0; font-weight: bold;">${params.quoteNumber}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e5e5;">
          <td style="padding: 8px 0; color: #666;">Amount</td>
          <td style="padding: 8px 0; font-weight: bold;">${params.total.toFixed(2)} ${params.currency}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Valid Until</td>
          <td style="padding: 8px 0; font-weight: bold; color: #f59e0b;">${params.validityDate}</td>
        </tr>
      </table>
      <p>If you would like to proceed, please let us know before the expiry date.</p>
      <p style="margin-top: 32px; color: #666; font-size: 14px;">
        Best regards,<br/>${params.companyName}
      </p>
    </div>
  `;
  return { subject, html };
}
