// NOTE: InvoicePDF/QuotePDF/ReportPDF statically pull in @react-pdf/renderer
// (a very heavy dependency). Prefer importing them via `await import(...)`
// inside event handlers, and use PDFViewerLazy for rendering — importing this
// barrel statically ships the whole renderer in the page chunk.
export { InvoicePDF } from "./InvoicePDF";
export { QuotePDF } from "./QuotePDF";
export { PDFViewer } from "./PDFViewerLazy";
export { ReportPDF, type ReportPDFColumn, type ReportPDFProps } from "./ReportPDF";
