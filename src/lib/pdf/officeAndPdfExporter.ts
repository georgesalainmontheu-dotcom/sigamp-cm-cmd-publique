import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { computeSha256Hex } from '../offline/offlineStore';
import type { RbacRole } from '../../types/domain';

export interface MultiPageOfficialPdfInput {
  documentCategory: string;
  documentNumber: string;
  title: string;
  entityId: string;
  entityName: string;
  entityCode: string;
  city: string;
  signatoryTitle: string;
  signatoryName: string;
  actorUserId: string;
  actorRole: RbacRole;
  primaryColorHex?: string;
  accentColorHex?: string;
  watermarkText?: string;
  sections: Array<{
    heading?: string;
    body: string;
  }>;
  tableRows?: string[][];
  ampliations?: string[];
  verificationBaseUrl?: string;
}

export interface MultiPageOfficialExportResult {
  pdfBytes: Uint8Array;
  fileName: string;
  pageCount: number;
  sha256Seal: string;
  qrVerificationId: string;
  issuedAtIso: string;
}

function hexToRgbTuple(hex?: string, fallback: [number, number, number] = [0.04, 0.12, 0.24]) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return rgb(...fallback);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Normalisation typographique complète préservant les accents français et caractères WinAnsi
 * tout en transposant proprement les symboles Unicode hors table (guillemets, tirets, ligatures).
 */
export function normalizeFrenchWinAnsi(raw: string): string {
  return raw
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/[’‘‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/€/g, 'EUR')
    .replace(/…/g, '...')
    .replace(/[•▪]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, ' ');
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = normalizeFrenchWinAnsi(text);
  const out: string[] = [];
  for (const para of clean.split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const cand = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(cand, size) <= maxWidth) {
        line = cand;
      } else {
        if (line) out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildMultiPageOfficialPdf(
  input: MultiPageOfficialPdfInput
): Promise<MultiPageOfficialExportResult> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const primaryColor = hexToRgbTuple(input.primaryColorHex, [0.04, 0.12, 0.24]);
  const accentColor = hexToRgbTuple(input.accentColorHex, [0.83, 0.69, 0.22]);

  const issuedAtIso = new Date().toISOString();
  const contentDigest = await computeSha256Hex(
    `${input.entityId}|${input.documentNumber}|${input.title}|${input.sections.map((s) => s.body).join('|')}`
  );
  const qrVerificationId = `SIGAMP-${contentDigest.slice(0, 12).toUpperCase()}`;
  const verifyUrl = `${input.verificationBaseUrl ?? 'https://sigamp-cm-commande-publique.vercel.app'}/verify/${qrVerificationId}`;

  const qrPngDataUrl = await QRCode.toDataURL(verifyUrl, {
    width: 140,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const qrImage = await pdfDoc.embedPng(
    Uint8Array.from(atob(qrPngDataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
  );

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 44;
  const maxWidth = pageWidth - marginX * 2;
  const pages: PDFPage[] = [];

  const addPage = (isFirst: boolean): { page: PDFPage; y: number } => {
    const p = pdfDoc.addPage([pageWidth, pageHeight]);
    pages.push(p);

    if (input.watermarkText) {
      p.drawText(normalizeFrenchWinAnsi(input.watermarkText), {
        x: 120,
        y: 340,
        size: 38,
        font: fontBold,
        color: rgb(0.92, 0.93, 0.96),
        rotate: degrees(32),
      });
    }

    if (isFirst) {
      p.drawRectangle({ x: 0, y: pageHeight - 76, width: pageWidth, height: 76, color: primaryColor });
      p.drawRectangle({ x: 0, y: pageHeight - 79, width: pageWidth, height: 3, color: accentColor });
      p.drawText(normalizeFrenchWinAnsi(`REPUBLIQUE DU CAMEROUN  -  ${input.entityName}`), {
        x: marginX,
        y: pageHeight - 28,
        size: 10,
        font: fontBold,
        color: accentColor,
      });
      p.drawText(normalizeFrenchWinAnsi(input.title.slice(0, 78)), {
        x: marginX,
        y: pageHeight - 48,
        size: 12.5,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      p.drawText(normalizeFrenchWinAnsi(`N° ${input.documentNumber}  |  ${input.city}  |  ${input.documentCategory}`), {
        x: marginX,
        y: pageHeight - 65,
        size: 8.5,
        font: fontReg,
        color: rgb(0.88, 0.91, 0.96),
      });
      return { page: p, y: pageHeight - 102 };
    }

    p.drawText(
      normalizeFrenchWinAnsi(`${input.entityName}  -  ${input.documentNumber}`),
      { x: marginX, y: pageHeight - 28, size: 8, font: fontBold, color: primaryColor }
    );
    p.drawLine({
      start: { x: marginX, y: pageHeight - 34 },
      end: { x: pageWidth - marginX, y: pageHeight - 34 },
      thickness: 0.7,
      color: accentColor,
    });
    return { page: p, y: pageHeight - 54 };
  };

  let cur = addPage(true);

  for (const sec of input.sections) {
    if (sec.heading) {
      if (cur.y < 110) cur = addPage(false);
      cur.page.drawText(normalizeFrenchWinAnsi(sec.heading.slice(0, 90)), {
        x: marginX,
        y: cur.y,
        size: 10.5,
        font: fontBold,
        color: primaryColor,
      });
      cur.y -= 16;
    }

    const lines = wrapLines(sec.body, fontReg, 9.5, maxWidth);
    for (const line of lines) {
      if (cur.y < 76) cur = addPage(false);
      if (line) {
        cur.page.drawText(line, {
          x: marginX,
          y: cur.y,
          size: 9.5,
          font: fontReg,
          color: rgb(0.1, 0.12, 0.16),
        });
      }
      cur.y -= 13;
    }
    cur.y -= 8;
  }

  // Bloc signature + QR Code sur la dernière page
  if (cur.y < 175) cur = addPage(false);
  cur.page.drawLine({
    start: { x: marginX, y: cur.y },
    end: { x: pageWidth - marginX, y: cur.y },
    thickness: 0.8,
    color: rgb(0.8, 0.84, 0.88),
  });
  cur.y -= 18;

  cur.page.drawText(normalizeFrenchWinAnsi(input.signatoryTitle), {
    x: marginX,
    y: cur.y,
    size: 9.5,
    font: fontBold,
    color: primaryColor,
  });
  cur.page.drawText(normalizeFrenchWinAnsi(input.signatoryName), {
    x: marginX,
    y: cur.y - 14,
    size: 9.5,
    font: fontReg,
    color: rgb(0.1, 0.12, 0.16),
  });
  if (input.ampliations && input.ampliations.length > 0) {
    cur.page.drawText(
      normalizeFrenchWinAnsi(`Ampliations : ${input.ampliations.join(' | ')}`).slice(0, 82),
      { x: marginX, y: cur.y - 34, size: 7.5, font: fontReg, color: rgb(0.35, 0.4, 0.48) }
    );
  }
  cur.page.drawText(
    normalizeFrenchWinAnsi(`Scelle SHA-256 : ${contentDigest.slice(0, 40)}...`),
    { x: marginX, y: cur.y - 50, size: 7.5, font: fontReg, color: rgb(0.35, 0.4, 0.48) }
  );
  cur.page.drawImage(qrImage, {
    x: pageWidth - marginX - 66,
    y: cur.y - 58,
    width: 66,
    height: 66,
  });

  // Numérotation et paraphe obligatoire sur toutes les pages
  const total = pages.length;
  for (let i = 0; i < total; i += 1) {
    const p = pages[i]!;
    p.drawText(
      normalizeFrenchWinAnsi(
        `SIGAMP-CM / TIT-CS  |  Paraphe : ________  |  Page ${i + 1} / ${total}  |  ID : ${qrVerificationId}`
      ),
      { x: marginX, y: 24, size: 7.5, font: fontReg, color: rgb(0.42, 0.47, 0.54) }
    );
  }

  const pdfBytes = await pdfDoc.save();
  const sha256Seal = await computeSha256Hex(pdfBytes);
  const safeNum = input.documentNumber.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 48);

  return {
    pdfBytes,
    fileName: `${input.documentCategory}_${safeNum}.pdf`,
    pageCount: total,
    sha256Seal,
    qrVerificationId,
    issuedAtIso,
  };
}

/**
 * Génère un document Word (.docx) modifiable officiel conforme au format administratif camerounais.
 */
export async function buildOfficialDocxBuffer(
  input: MultiPageOfficialPdfInput
): Promise<{ docxBytes: Uint8Array; fileName: string; sha256: string }> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({ text: 'RÉPUBLIQUE DU CAMEROUN', bold: true, size: 22 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      children: [
        new TextRun({ text: 'Paix - Travail - Patrie', italics: true, size: 18 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${input.entityName} (${input.entityCode})`,
          bold: true,
          size: 24,
          color: '0A1F3D',
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `N° ${input.documentNumber}`, bold: true, size: 20 }),
        new TextRun({ text: `   —   ${input.city}`, size: 20 }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: input.title, bold: true, size: 24, color: '0A1F3D' }),
      ],
    }),
  ];

  for (const sec of input.sections) {
    if (sec.heading) {
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({ text: sec.heading, bold: true, size: 22, color: '0A1F3D' }),
          ],
        })
      );
    }
    for (const line of sec.body.split('\n')) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 20 })],
        })
      );
    }
  }

  if (input.tableRows && input.tableRows.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: input.tableRows.map(
          (row, rIdx) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                      left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                    },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: cell, bold: rIdx === 0, size: 18 }),
                        ],
                      }),
                    ],
                  })
              ),
            })
        ),
      })
    );
  }

  children.push(
    new Paragraph({
      spacing: { before: 240, after: 40 },
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: input.signatoryTitle, bold: true, size: 20 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 180 },
      children: [new TextRun({ text: input.signatoryName, size: 20 })],
    })
  );

  if (input.ampliations && input.ampliations.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: 'AMPLIATIONS : ', bold: true, size: 18 }),
          new TextRun({ text: input.ampliations.join(' ; '), size: 18 }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${input.entityName} — ${input.documentNumber}`,
                    size: 16,
                    color: '64748B',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'SIGAMP-CM V3.0 (TIT-CS)  |  Paraphe : ________  |  Page ',
                    size: 16,
                    color: '64748B',
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
                  new TextRun({ text: ' / ', size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const docxBytes = new Uint8Array(buffer);
  const sha256 = await computeSha256Hex(docxBytes);
  const safeNum = input.documentNumber.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 48);

  return {
    docxBytes,
    fileName: `${input.documentCategory}_${safeNum}.docx`,
    sha256,
  };
}
