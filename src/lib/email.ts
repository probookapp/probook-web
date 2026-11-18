import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * `EMAIL_DRIVER=log` (outside production): write each message to the server log
 * instead of sending it. The test environment uses it — sending from there
 * either failed on an invalid key, printing a stack trace per signup, or with a
 * valid one would have mailed every fake address the e2e suites invent.
 *
 * CI runs the suite against a production build, so the production guard alone
 * shut the log driver off there: the reminders job then sent through Resend
 * with the dummy key, failed, and counted the account as a casualty.
 * E2E_TEST_MODE (set by the CI workflow only, never on a real deployment) lets
 * it through, the same way it opens the /api/test routes.
 */
function logsInsteadOfSending(): boolean {
  return (
    process.env.EMAIL_DRIVER === "log" &&
    (process.env.NODE_ENV !== "production" || process.env.E2E_TEST_MODE === "1")
  );
}

export function isResendConfigured(): boolean {
  return logsInsteadOfSending() || !!process.env.RESEND_API_KEY;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/** Shared markup for the "verify your email" message (link expires in 24h). */
export function verificationEmailHtml(verifyUrl: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">Verify Your Email</h2>
      <p>Click the link below to verify your email address:</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background-color: #1c5f68; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
          Verify Email
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
  if (logsInsteadOfSending()) {
    console.info(`[email:log] to=${to} subject=${JSON.stringify(subject)}`);
    return;
  }
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

// ─── Reminder emails ───
//
// A reminder goes to the business's own client, so it speaks the business's
// language (company_settings.app_language), not English. Amounts and dates are
// written the way that language writes them, with the currency's own number
// of decimals (millimes for the dinar tunisien).

type ReminderLang = "fr" | "en" | "ar";

interface ReminderText {
  overdueSubject: (n: string) => string;
  overdueTitle: string;
  overdueIntro: string;
  overdueOutro: string;
  quoteSubject: (n: string) => string;
  quoteTitle: string;
  quoteIntro: string;
  quoteOutro: string;
  greeting: (name: string) => string;
  invoice: string;
  quote: string;
  amountDue: string;
  amount: string;
  dueDate: string;
  validUntil: string;
  regards: string;
}

const REMINDER_TEXT: Record<ReminderLang, ReminderText> = {
  fr: {
    overdueSubject: (n) => `Relance : facture ${n}`,
    overdueTitle: "Relance de paiement",
    overdueIntro: "Sauf erreur de notre part, la facture suivante reste impayée à ce jour :",
    overdueOutro:
      "Merci de bien vouloir procéder à son règlement dans les meilleurs délais. Si le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.",
    quoteSubject: (n) => `Votre devis ${n} arrive à échéance`,
    quoteTitle: "Devis bientôt expiré",
    quoteIntro: "Nous vous rappelons que le devis suivant arrive bientôt à échéance :",
    quoteOutro: "Si vous souhaitez donner suite, merci de nous le faire savoir avant cette date.",
    greeting: (name) => `Bonjour ${name},`,
    invoice: "Facture",
    quote: "Devis",
    amountDue: "Reste à payer",
    amount: "Montant",
    dueDate: "Échéance",
    validUntil: "Valable jusqu'au",
    regards: "Cordialement,",
  },
  en: {
    overdueSubject: (n) => `Payment reminder: invoice ${n}`,
    overdueTitle: "Payment reminder",
    overdueIntro: "Unless we are mistaken, the following invoice is still unpaid:",
    overdueOutro:
      "Please arrange payment at your earliest convenience. If you have paid in the meantime, please disregard this message.",
    quoteSubject: (n) => `Your quote ${n} expires soon`,
    quoteTitle: "Quote expiring soon",
    quoteIntro: "This is a reminder that the following quote will expire soon:",
    quoteOutro: "If you would like to proceed, please let us know before that date.",
    greeting: (name) => `Dear ${name},`,
    invoice: "Invoice",
    quote: "Quote",
    amountDue: "Amount due",
    amount: "Amount",
    dueDate: "Due date",
    validUntil: "Valid until",
    regards: "Best regards,",
  },
  ar: {
    overdueSubject: (n) => `تذكير بالدفع: الفاتورة ${n}`,
    overdueTitle: "تذكير بالدفع",
    overdueIntro: "ما لم نكن مخطئين، فإن الفاتورة التالية لم تُسدَّد بعد:",
    overdueOutro: "نرجو منكم تسديدها في أقرب الآجال. وإذا تم الدفع في الأثناء، فلا تأخذوا هذه الرسالة بعين الاعتبار.",
    quoteSubject: (n) => `عرض السعر ${n} يقترب من انتهاء صلاحيته`,
    quoteTitle: "عرض سعر يقترب من انتهاء صلاحيته",
    quoteIntro: "نذكّركم بأن عرض السعر التالي سينتهي قريبًا:",
    quoteOutro: "إذا رغبتم في المتابعة، يرجى إعلامنا قبل هذا التاريخ.",
    greeting: (name) => `السيد(ة) ${name}،`,
    invoice: "الفاتورة",
    quote: "عرض السعر",
    amountDue: "المبلغ المتبقي",
    amount: "المبلغ",
    dueDate: "تاريخ الاستحقاق",
    validUntil: "صالح إلى غاية",
    regards: "مع خالص التحيات،",
  },
};

function reminderLang(lang: string | null | undefined): ReminderLang {
  return lang === "en" || lang === "ar" ? lang : "fr";
}

const INTL_LOCALE: Record<ReminderLang, string> = { fr: "fr-FR", en: "en-GB", ar: "ar-DZ" };

function reminderMoney(amount: number, currency: string, lang: ReminderLang): string {
  try {
    return new Intl.NumberFormat(INTL_LOCALE[lang], { style: "currency", currency, numberingSystem: "latn" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "2026-07-01" as the language writes a date; anything else is left as is. */
function reminderDate(isoDay: string, lang: ReminderLang): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDay;
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(d);
}

interface OverdueParams {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  /** What remains to pay: total and stamp duty, less what was already received. */
  total: number;
  currency: string;
  dueDate: string;
  lang?: string | null;
}

interface QuoteParams {
  companyName: string;
  clientName: string;
  quoteNumber: string;
  total: number;
  currency: string;
  validityDate: string;
  lang?: string | null;
}

// Plain text versions for the mailto: fallback.
export function paymentOverdueEmailPlainText(params: OverdueParams) {
  const lang = reminderLang(params.lang);
  const t = REMINDER_TEXT[lang];
  const subject = t.overdueSubject(params.invoiceNumber);
  const body = [
    t.greeting(params.clientName),
    "",
    t.overdueIntro,
    "",
    `${t.invoice} : ${params.invoiceNumber}`,
    `${t.amountDue} : ${reminderMoney(params.total, params.currency, lang)}`,
    `${t.dueDate} : ${reminderDate(params.dueDate, lang)}`,
    "",
    t.overdueOutro,
    "",
    t.regards,
    params.companyName,
  ].join("\n");
  return { subject, body };
}

export function quoteExpiringEmailPlainText(params: QuoteParams) {
  const lang = reminderLang(params.lang);
  const t = REMINDER_TEXT[lang];
  const subject = t.quoteSubject(params.quoteNumber);
  const body = [
    t.greeting(params.clientName),
    "",
    t.quoteIntro,
    "",
    `${t.quote} : ${params.quoteNumber}`,
    `${t.amount} : ${reminderMoney(params.total, params.currency, lang)}`,
    `${t.validUntil} : ${reminderDate(params.validityDate, lang)}`,
    "",
    t.quoteOutro,
    "",
    t.regards,
    params.companyName,
  ].join("\n");
  return { subject, body };
}

// ─── Email Templates ───

/**
 * Escape a value before it goes into an HTML email body (audit CFG-N2).
 *
 * Client and company names are typed by users and land in a message sent to a
 * third party. Unescaped, an apostrophe or an ampersand renders wrong and a
 * tag renders as markup, in someone else's inbox, where nothing can be
 * corrected after the fact.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function reminderHtml(opts: {
  title: string;
  greeting: string;
  intro: string;
  rows: Array<[string, string, string?]>;
  outro: string;
  regards: string;
  companyName: string;
}): string {
  const rows = opts.rows
    .map(([label, value, color], i) => {
      const border = i < opts.rows.length - 1 ? ' style="border-bottom: 1px solid #e5e5e5;"' : "";
      const tint = color ? ` color: ${color};` : "";
      return `
        <tr${border}>
          <td style="padding: 8px 0; color: #666;">${escapeHtml(label)}</td>
          <td style="padding: 8px 0; font-weight: bold;${tint}">${escapeHtml(value)}</td>
        </tr>`;
    })
    .join("");
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1a1a1a;">${escapeHtml(opts.title)}</h2>
      <p>${escapeHtml(opts.greeting)}</p>
      <p>${escapeHtml(opts.intro)}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">${rows}
      </table>
      <p>${escapeHtml(opts.outro)}</p>
      <p style="margin-top: 32px; color: #666; font-size: 14px;">
        ${escapeHtml(opts.regards)}<br/>${escapeHtml(opts.companyName)}
      </p>
    </div>
  `;
}

export function paymentOverdueEmail(params: OverdueParams) {
  const lang = reminderLang(params.lang);
  const t = REMINDER_TEXT[lang];
  const html = reminderHtml({
    title: t.overdueTitle,
    greeting: t.greeting(params.clientName),
    intro: t.overdueIntro,
    rows: [
      [t.invoice, params.invoiceNumber],
      [t.amountDue, reminderMoney(params.total, params.currency, lang)],
      [t.dueDate, reminderDate(params.dueDate, lang), "#dc2626"],
    ],
    outro: t.overdueOutro,
    regards: t.regards,
    companyName: params.companyName,
  });
  return { subject: t.overdueSubject(params.invoiceNumber), html };
}

export function quoteExpiringEmail(params: QuoteParams) {
  const lang = reminderLang(params.lang);
  const t = REMINDER_TEXT[lang];
  const html = reminderHtml({
    title: t.quoteTitle,
    greeting: t.greeting(params.clientName),
    intro: t.quoteIntro,
    rows: [
      [t.quote, params.quoteNumber],
      [t.amount, reminderMoney(params.total, params.currency, lang)],
      [t.validUntil, reminderDate(params.validityDate, lang), "#f59e0b"],
    ],
    outro: t.quoteOutro,
    regards: t.regards,
    companyName: params.companyName,
  });
  return { subject: t.quoteSubject(params.quoteNumber), html };
}
