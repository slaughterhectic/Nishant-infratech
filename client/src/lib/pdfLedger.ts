import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type RGB = [number, number, number];

const BRAND: RGB = [219, 82, 16];
const INK: RGB = [35, 32, 30];
const MUTED: RGB = [125, 118, 112];
const LINE: RGB = [228, 221, 213];
const PANEL: RGB = [250, 247, 244];
const FOOT_PANEL: RGB = [250, 241, 233];
const RED: RGB = [192, 39, 30];
const GREEN: RGB = [15, 122, 75];

export interface SummaryCard {
  label: string;
  value: string;
  tone?: 'ink' | 'red' | 'green';
}

// jsPDF's built-in fonts (helvetica/times/courier) have no glyph for ₹ — it
// falls back to a tofu glyph whose measured width doesn't match its drawn
// width, which throws off autoTable's column sizing and clips digits. "Rs."
// is plain ASCII and renders reliably, so PDFs use it instead of formatINR.
export const formatMoneyPdf = (amount: number): string =>
  `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)}`;

export interface LedgerPdfOptions {
  documentTitle: string;
  subjectName: string;
  metaLines: string[];
  summary: SummaryCard[];
  columns: string[];
  rows: (string | number)[][];
  footRow?: (string | number)[];
  numericColumnIndexes: number[];
  filename: string;
}

export function downloadLedgerPdf(opts: LedgerPdfOptions) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Letterhead band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('NISHANT INFRATECH', margin, 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Cement & Sariya Trading', margin, 17.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(opts.documentTitle, pageWidth - margin, 11.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageWidth - margin,
    17.5,
    { align: 'right' }
  );

  // Subject block
  let y = 35;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(opts.subjectName, margin, y);
  y += 6;
  if (opts.metaLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(opts.metaLines.join('   ·   '), margin, y);
    y += 6;
  }
  y += 3;

  // Summary cards
  if (opts.summary.length) {
    const gap = 4;
    const cardW = (pageWidth - margin * 2 - gap * (opts.summary.length - 1)) / opts.summary.length;
    const cardH = 17;
    opts.summary.forEach((card, i) => {
      const x = margin + i * (cardW + gap);
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.25);
      doc.setFillColor(...PANEL);
      doc.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(card.label.toUpperCase(), x + 3.5, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const color = card.tone === 'red' ? RED : card.tone === 'green' ? GREEN : INK;
      doc.setTextColor(...color);
      doc.text(card.value, x + 3.5, y + 13);
    });
    y += cardH + 8;
  }

  autoTable(doc, {
    startY: y,
    head: [opts.columns],
    body: opts.rows,
    foot: opts.footRow ? [opts.footRow] : undefined,
    margin: { left: margin, right: margin, top: 24 },
    theme: 'grid',
    styles: {
      fontSize: 8.7,
      cellPadding: { top: 3.2, bottom: 3.2, left: 3.5, right: 3.5 },
      lineColor: LINE,
      lineWidth: 0.15,
      textColor: INK,
      valign: 'middle',
    },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 8.3 },
    footStyles: { fillColor: FOOT_PANEL, textColor: INK, fontStyle: 'bold', lineWidth: 0.3 },
    alternateRowStyles: { fillColor: PANEL },
    columnStyles: Object.fromEntries(opts.numericColumnIndexes.map((i) => [i, { halign: 'right' }])),
  });

  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text('Nishant Infratech · Generated via ERP', margin, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  doc.save(opts.filename);
}
