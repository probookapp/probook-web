// ─── Receipt Printer: window.print() + WebUSB ESC/POS ───

export interface ReceiptData {
  companyName: string;
  ticketNumber: string;
  date: string;
  items: Array<{
    designation: string;
    quantity: number;
    unitPrice: number;
    total: number;
    taxRate: number;
    discountPercent: number;
  }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  discountPercent: number;
  discountAmount: number;
  finalAmount: number;
  payments: Array<{
    method: "CASH" | "CARD";
    amount: number;
    cashGiven?: number;
    changeGiven?: number;
  }>;
  currency: string;
  footerText?: string;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Method 1: window.print() ───

export function printReceiptWindow(data: ReceiptData): void {
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;

  const lines = data.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:2px 0">${item.designation}</td>
          <td style="text-align:right;padding:2px 0;white-space:nowrap">${item.quantity} x ${fmt(item.unitPrice, data.currency)}</td>
          <td style="text-align:right;padding:2px 0;white-space:nowrap">${fmt(item.total, data.currency)}</td>
        </tr>${item.discountPercent > 0 ? `<tr><td colspan="3" style="font-size:10px;color:#666;padding:0 0 2px 8px">-${item.discountPercent}%</td></tr>` : ""}`
    )
    .join("");

  const paymentLines = data.payments
    .map((p) => {
      let line = `<div style="display:flex;justify-content:space-between"><span>${p.method}</span><span>${fmt(p.amount, data.currency)}</span></div>`;
      if (p.method === "CASH" && p.cashGiven) {
        line += `<div style="display:flex;justify-content:space-between;font-size:11px;color:#666"><span>Given</span><span>${fmt(p.cashGiven, data.currency)}</span></div>`;
        if (p.changeGiven && p.changeGiven > 0) {
          line += `<div style="display:flex;justify-content:space-between;font-size:11px;color:#666"><span>Change</span><span>${fmt(p.changeGiven, data.currency)}</span></div>`;
        }
      }
      return line;
    })
    .join("");

  const discountSection =
    data.discountPercent > 0 || data.discountAmount > 0
      ? `<div style="display:flex;justify-content:space-between"><span>Discount${data.discountPercent > 0 ? ` (${data.discountPercent}%)` : ""}</span><span>-${fmt(data.discountAmount > 0 ? data.discountAmount : data.total * (data.discountPercent / 100), data.currency)}</span></div>`
      : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; padding: 4mm; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  .total { font-size: 16px; font-weight: bold; }
  .center { text-align: center; }
  @media print { body { width: 80mm; padding: 2mm; } }
</style></head><body>
  <div class="center" style="margin-bottom:8px">
    <div style="font-size:16px;font-weight:bold">${data.companyName}</div>
    <div style="font-size:10px;color:#666">${data.date}</div>
    <div style="font-size:11px">${data.ticketNumber}</div>
  </div>
  <div class="sep"></div>
  <table>${lines}</table>
  <div class="sep"></div>
  <div style="display:flex;justify-content:space-between"><span>Subtotal HT</span><span>${fmt(data.subtotal, data.currency)}</span></div>
  <div style="display:flex;justify-content:space-between"><span>VAT</span><span>${fmt(data.taxAmount, data.currency)}</span></div>
  <div style="display:flex;justify-content:space-between"><span>Total TTC</span><span>${fmt(data.total, data.currency)}</span></div>
  ${discountSection}
  <div class="sep"></div>
  <div class="total" style="display:flex;justify-content:space-between"><span>TOTAL</span><span>${fmt(data.finalAmount, data.currency)}</span></div>
  <div class="sep"></div>
  ${paymentLines}
  <div class="sep"></div>
  <div class="center" style="margin-top:8px;font-size:11px">${data.footerText || "Thank you for your purchase!"}</div>
</body></html>`;

  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  w.addEventListener("afterprint", () => w.close());
}

// ─── Method 2: WebUSB ESC/POS ───

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

// ESC/POS command helpers
const ESC = 0x1b;
const GS = 0x1d;

function escCmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

const CMD = {
  INIT: escCmd(ESC, 0x40), // ESC @ - Initialize printer
  BOLD_ON: escCmd(ESC, 0x45, 1), // ESC E 1
  BOLD_OFF: escCmd(ESC, 0x45, 0), // ESC E 0
  ALIGN_CENTER: escCmd(ESC, 0x61, 1), // ESC a 1
  ALIGN_LEFT: escCmd(ESC, 0x61, 0), // ESC a 0
  ALIGN_RIGHT: escCmd(ESC, 0x61, 2), // ESC a 2
  FEED: (n: number) => escCmd(ESC, 0x64, n), // ESC d n - Feed n lines
  CUT: escCmd(GS, 0x56, 66, 3), // GS V 66 3 - Partial cut with feed
  DOUBLE_HEIGHT: escCmd(ESC, 0x21, 0x10), // ESC ! 16
  NORMAL_SIZE: escCmd(ESC, 0x21, 0x00), // ESC ! 0
};

const encoder = new TextEncoder();

function textBytes(text: string): Uint8Array {
  return encoder.encode(text + "\n");
}

function padLine(left: string, right: string, width = 42): string {
  const pad = width - left.length - right.length;
  return left + " ".repeat(Math.max(1, pad)) + right;
}

function separator(width = 42): string {
  return "-".repeat(width);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function buildEscPosReceipt(data: ReceiptData): Uint8Array {
  const f = (n: number) => n.toFixed(2);
  const parts: Uint8Array[] = [];

  const add = (...items: Uint8Array[]) => parts.push(...items);

  // Initialize
  add(CMD.INIT);

  // Header - centered, bold
  add(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  add(textBytes(data.companyName));
  add(CMD.NORMAL_SIZE, CMD.BOLD_OFF);
  add(textBytes(data.date));
  add(textBytes(data.ticketNumber));
  add(CMD.ALIGN_LEFT);

  // Separator
  add(textBytes(separator()));

  // Items
  for (const item of data.items) {
    add(textBytes(item.designation));
    add(
      textBytes(
        padLine(
          `  ${item.quantity} x ${f(item.unitPrice)}`,
          `${f(item.total)} ${data.currency}`
        )
      )
    );
    if (item.discountPercent > 0) {
      add(textBytes(`    -${item.discountPercent}%`));
    }
  }

  // Separator
  add(textBytes(separator()));

  // Totals
  add(textBytes(padLine("Subtotal HT", `${f(data.subtotal)} ${data.currency}`)));
  add(textBytes(padLine("VAT", `${f(data.taxAmount)} ${data.currency}`)));
  add(textBytes(padLine("Total TTC", `${f(data.total)} ${data.currency}`)));

  if (data.discountPercent > 0 || data.discountAmount > 0) {
    const discAmt =
      data.discountAmount > 0
        ? data.discountAmount
        : data.total * (data.discountPercent / 100);
    add(
      textBytes(
        padLine(
          `Discount${data.discountPercent > 0 ? ` (${data.discountPercent}%)` : ""}`,
          `-${f(discAmt)} ${data.currency}`
        )
      )
    );
  }

  add(textBytes(separator()));

  // Grand total - bold, double height
  add(CMD.BOLD_ON, CMD.DOUBLE_HEIGHT);
  add(textBytes(padLine("TOTAL", `${f(data.finalAmount)} ${data.currency}`)));
  add(CMD.NORMAL_SIZE, CMD.BOLD_OFF);

  add(textBytes(separator()));

  // Payments
  for (const p of data.payments) {
    add(textBytes(padLine(p.method, `${f(p.amount)} ${data.currency}`)));
    if (p.method === "CASH" && p.cashGiven) {
      add(textBytes(padLine("  Given", `${f(p.cashGiven)} ${data.currency}`)));
      if (p.changeGiven && p.changeGiven > 0) {
        add(textBytes(padLine("  Change", `${f(p.changeGiven)} ${data.currency}`)));
      }
    }
  }

  add(textBytes(separator()));

  // Footer
  add(CMD.ALIGN_CENTER);
  add(textBytes(data.footerText || "Thank you for your purchase!"));
  add(CMD.ALIGN_LEFT);

  // Feed and cut
  add(CMD.FEED(4), CMD.CUT);

  return concat(...parts);
}

export async function printReceiptUsb(data: ReceiptData): Promise<void> {
  if (!isWebUsbSupported()) {
    throw new Error("WebUSB is not supported in this browser");
  }

  // Request USB device - printer class 0x07
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: 7 }], // Printer class
  });

  await device.open();

  // Find the first OUT endpoint on any claimed interface
  let endpointNumber = 1;
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 7) {
          await device.claimInterface(iface.interfaceNumber);
          const outEndpoint = alt.endpoints.find((ep) => ep.direction === "out");
          if (outEndpoint) {
            endpointNumber = outEndpoint.endpointNumber;
          }
          break;
        }
      }
    }
  }

  const receiptBytes = buildEscPosReceipt(data);

  // Send in chunks (some printers have small buffers)
  const CHUNK_SIZE = 64;
  for (let i = 0; i < receiptBytes.length; i += CHUNK_SIZE) {
    const chunk = receiptBytes.slice(i, i + CHUNK_SIZE);
    await device.transferOut(endpointNumber, chunk);
  }

  await device.close();
}
