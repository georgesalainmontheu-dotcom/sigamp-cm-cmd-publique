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
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { computeSha256Hex } from '../offline/offlineStore';
import type { EntityVisualIdentity } from '../domain/entityStudioEngine';
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
  studioIdentity?: Partial<EntityVisualIdentity>;
  sections: Array<{
    heading?: string;
    body: string;
  }>;
  tableRows?: string[][];
  tables?: Array<{
    title?: string;
    rows: string[][];
  }>;
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

  const primaryColor = hexToRgbTuple(
    input.primaryColorHex ?? input.studioIdentity?.primaryColor,
    [0.04, 0.12, 0.24]
  );
  const accentColor = hexToRgbTuple(
    input.accentColorHex ?? input.studioIdentity?.accentColor,
    [0.83, 0.69, 0.22]
  );

  // Embed optionnel du logo de l'entité (Data URI PNG/JPEG ou URL HTTPS)
  let embeddedLogo: PDFImage | null = null;
  const rawLogo = input.studioIdentity?.logoUrl;
  if (rawLogo) {
    try {
      let bytes: Uint8Array | null = null;
      let isPng = true;
      if (rawLogo.startsWith('data:image/png;base64,')) {
        bytes = Uint8Array.from(atob(rawLogo.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
        isPng = true;
      } else if (
        rawLogo.startsWith('data:image/jpeg;base64,') ||
        rawLogo.startsWith('data:image/jpg;base64,')
      ) {
        bytes = Uint8Array.from(atob(rawLogo.split(',')[1] ?? ''), (c) => c.charCodeAt(0));
        isPng = false;
      } else if (/^https?:\/\//i.test(rawLogo)) {
        const res = await fetch(rawLogo);
        if (res.ok) {
          const ct = res.headers.get('content-type') ?? '';
          const buf = new Uint8Array(await res.arrayBuffer());
          if (ct.includes('png') || rawLogo.toLowerCase().endsWith('.png')) {
            bytes = buf;
            isPng = true;
          } else if (
            ct.includes('jpeg') ||
            ct.includes('jpg') ||
            /\.(jpe?g)$/i.test(rawLogo)
          ) {
            bytes = buf;
            isPng = false;
          }
        }
      }
      if (bytes && bytes.byteLength > 0) {
        embeddedLogo = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      }
    } catch {
      embeddedLogo = null;
    }
  }

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
      const sid = input.studioIdentity;
      if (sid && (sid.headerLayout === 'BILINGUAL_SPLIT' || sid.tutelleFr || sid.emittingServiceFr)) {
        const isBilingual = sid.headerLayout !== 'CENTERED';
        const headerBottom = pageHeight - 134;

        // Fond papier à en-tête officiel
        p.drawRectangle({
          x: 0,
          y: headerBottom,
          width: pageWidth,
          height: 134,
          color: rgb(0.985, 0.99, 0.996),
        });

        // Logo optionnel selon positionnement
        if (embeddedLogo) {
          const dims = embeddedLogo.scaleToFit(44, 44);
          const logoX =
            sid.logoPosition === 'LEFT'
              ? marginX
              : pageWidth / 2 - dims.width / 2;
          p.drawImage(embeddedLogo, {
            x: logoX,
            y: pageHeight - 54,
            width: dims.width,
            height: dims.height,
          });
          if (sid.logoPosition === 'DUAL') {
            p.drawImage(embeddedLogo, {
              x: pageWidth - marginX - dims.width,
              y: pageHeight - 54,
              width: dims.width,
              height: dims.height,
            });
          }
        }

        if (isBilingual) {
          const leftX = marginX;
          const rightX = pageWidth - marginX - 185;
          p.drawText('REPUBLIQUE DU CAMEROUN', {
            x: leftX,
            y: pageHeight - 22,
            size: 8.5,
            font: fontBold,
            color: primaryColor,
          });
          p.drawText('Paix - Travail - Patrie', {
            x: leftX,
            y: pageHeight - 33,
            size: 7.5,
            font: fontReg,
            color: rgb(0.3, 0.35, 0.42),
          });
          p.drawText(normalizeFrenchWinAnsi((sid.tutelleFr ?? 'MINISTERE DE LA DECENTRALISATION').slice(0, 44)), {
            x: leftX,
            y: pageHeight - 45,
            size: 7,
            font: fontBold,
            color: rgb(0.2, 0.25, 0.32),
          });
          p.drawText(normalizeFrenchWinAnsi((sid.regionDeptLineFr ?? '').slice(0, 44)), {
            x: leftX,
            y: pageHeight - 55,
            size: 6.8,
            font: fontReg,
            color: rgb(0.35, 0.4, 0.48),
          });
          p.drawText(normalizeFrenchWinAnsi(input.entityName.slice(0, 42)), {
            x: leftX,
            y: pageHeight - 66,
            size: 8,
            font: fontBold,
            color: primaryColor,
          });
          p.drawText(normalizeFrenchWinAnsi((sid.emittingServiceFr ?? 'SERVICE DES MARCHES PUBLICS').slice(0, 44)), {
            x: leftX,
            y: pageHeight - 76,
            size: 6.8,
            font: fontReg,
            color: rgb(0.3, 0.35, 0.42),
          });

          // Colonne EN à droite
          p.drawText('REPUBLIC OF CAMEROON', {
            x: rightX,
            y: pageHeight - 22,
            size: 8.5,
            font: fontBold,
            color: primaryColor,
          });
          p.drawText('Peace - Work - Fatherland', {
            x: rightX,
            y: pageHeight - 33,
            size: 7.5,
            font: fontReg,
            color: rgb(0.3, 0.35, 0.42),
          });
          p.drawText(normalizeFrenchWinAnsi((sid.tutelleEn ?? 'MINISTRY OF DECENTRALIZATION').slice(0, 42)), {
            x: rightX,
            y: pageHeight - 45,
            size: 7,
            font: fontBold,
            color: rgb(0.2, 0.25, 0.32),
          });
          p.drawText(normalizeFrenchWinAnsi((sid.regionDeptLineEn ?? '').slice(0, 42)), {
            x: rightX,
            y: pageHeight - 55,
            size: 6.8,
            font: fontReg,
            color: rgb(0.35, 0.4, 0.48),
          });
          p.drawText(normalizeFrenchWinAnsi(input.entityName.slice(0, 40)), {
            x: rightX,
            y: pageHeight - 66,
            size: 8,
            font: fontBold,
            color: primaryColor,
          });
          p.drawText(normalizeFrenchWinAnsi((sid.emittingServiceEn ?? 'PUBLIC CONTRACTS SERVICE').slice(0, 42)), {
            x: rightX,
            y: pageHeight - 76,
            size: 6.8,
            font: fontReg,
            color: rgb(0.3, 0.35, 0.42),
          });
        } else {
          const centerLine = (txt: string, yPos: number, size: number, bold: boolean, clr = primaryColor) => {
            const clean = normalizeFrenchWinAnsi(txt.slice(0, 76));
            const f = bold ? fontBold : fontReg;
            const w = f.widthOfTextAtSize(clean, size);
            p.drawText(clean, { x: Math.max(marginX, (pageWidth - w) / 2), y: yPos, size, font: f, color: clr });
          };
          centerLine('REPUBLIQUE DU CAMEROUN  -  Paix - Travail - Patrie', pageHeight - 22, 8.5, true);
          if (sid.tutelleFr) centerLine(sid.tutelleFr, pageHeight - 34, 7.5, true, rgb(0.22, 0.27, 0.34));
          if (sid.regionDeptLineFr) centerLine(sid.regionDeptLineFr, pageHeight - 45, 7, false, rgb(0.35, 0.4, 0.48));
          centerLine(input.entityName, pageHeight - 58, 9.5, true, primaryColor);
          if (sid.emittingServiceFr) centerLine(sid.emittingServiceFr, pageHeight - 70, 7.5, false, rgb(0.28, 0.33, 0.4));
        }

        // Ligne NIU & Chapitre budgétaire + Barre tricolore Cameroun
        const metaLine = [
          sid.taxRegistrationNumber ? `NIU : ${sid.taxRegistrationNumber}` : '',
          sid.budgetChapterCode ? `Imputation : ${sid.budgetChapterCode}` : '',
          `Code : ${input.entityCode}`,
        ]
          .filter(Boolean)
          .join('   |   ');
        p.drawText(normalizeFrenchWinAnsi(metaLine), {
          x: marginX,
          y: pageHeight - 88,
          size: 7,
          font: fontReg,
          color: rgb(0.32, 0.38, 0.46),
        });

        if (sid.showTricolorBar !== false) {
          const third = pageWidth / 3;
          p.drawRectangle({ x: 0, y: pageHeight - 94, width: third, height: 3, color: rgb(0, 0.48, 0.37) });
          p.drawRectangle({ x: third, y: pageHeight - 94, width: third, height: 3, color: rgb(0.81, 0.07, 0.15) });
          p.drawRectangle({ x: third * 2, y: pageHeight - 94, width: third + 1, height: 3, color: rgb(0.99, 0.82, 0.09) });
        }

        // Bandeau Titre Acte / Dossier
        p.drawRectangle({ x: 0, y: headerBottom, width: pageWidth, height: 38, color: primaryColor });
        p.drawText(normalizeFrenchWinAnsi(input.title.slice(0, 78)), {
          x: marginX,
          y: headerBottom + 21,
          size: 11,
          font: fontBold,
          color: rgb(1, 1, 1),
        });
        p.drawText(normalizeFrenchWinAnsi(`N° ${input.documentNumber}  |  ${input.city}  |  ${input.documentCategory}`), {
          x: marginX,
          y: headerBottom + 7,
          size: 8,
          font: fontReg,
          color: accentColor,
        });
        return { page: p, y: headerBottom - 20 };
      }

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

  // Rendu vectoriel multi-lignes des tableaux structurés (BPU, DQE, etc.)
  const allTables: Array<{ title?: string; rows: string[][] }> = [
    ...(input.tables ?? []),
    ...(input.tableRows && input.tableRows.length > 0 ? [{ rows: input.tableRows }] : []),
  ];

  for (const tbl of allTables) {
    if (!tbl.rows || tbl.rows.length === 0) continue;
    if (tbl.title) {
      if (cur.y < 110) cur = addPage(false);
      cur.page.drawText(normalizeFrenchWinAnsi(tbl.title.slice(0, 90)), {
        x: marginX,
        y: cur.y,
        size: 10,
        font: fontBold,
        color: primaryColor,
      });
      cur.y -= 14;
    }

    const colCount = Math.max(1, tbl.rows[0]?.length ?? 1);
    const colWidths =
      colCount === 5
        ? [maxWidth * 0.1, maxWidth * 0.36, maxWidth * 0.08, maxWidth * 0.16, maxWidth * 0.3]
        : colCount === 6
          ? [
              maxWidth * 0.09,
              maxWidth * 0.35,
              maxWidth * 0.08,
              maxWidth * 0.12,
              maxWidth * 0.16,
              maxWidth * 0.2,
            ]
          : Array.from({ length: colCount }, () => maxWidth / colCount);

    for (let rIdx = 0; rIdx < tbl.rows.length; rIdx += 1) {
      const row = tbl.rows[rIdx]!;
      const isHeader = rIdx === 0;
      const isTotalRow = row.some((c) => c.toUpperCase().includes('TOTAL') || c.toUpperCase().includes('NET À MANDATER') || c.toUpperCase().includes('NET A MANDATER'));
      const rowFont = isHeader || isTotalRow ? fontBold : fontReg;
      const cellWrapped = row.map((cell, cIdx) =>
        wrapLines(cell, rowFont, 7.8, Math.max(24, (colWidths[cIdx] ?? 60) - 8))
      );
      const maxLines = Math.max(1, ...cellWrapped.map((l) => l.length));
      const rowHeight = maxLines * 10 + 8;

      if (cur.y - rowHeight < 65) {
        cur = addPage(false);
      }

      const rowBottom = cur.y - rowHeight;
      if (isHeader) {
        cur.page.drawRectangle({
          x: marginX,
          y: rowBottom,
          width: maxWidth,
          height: rowHeight,
          color: primaryColor,
        });
      } else if (isTotalRow) {
        cur.page.drawRectangle({
          x: marginX,
          y: rowBottom,
          width: maxWidth,
          height: rowHeight,
          color: rgb(0.94, 0.96, 0.99),
        });
      }

      let xCursor = marginX;
      for (let cIdx = 0; cIdx < colCount; cIdx += 1) {
        const w = colWidths[cIdx] ?? maxWidth / colCount;
        cur.page.drawRectangle({
          x: xCursor,
          y: rowBottom,
          width: w,
          height: rowHeight,
          borderColor: rgb(0.78, 0.82, 0.88),
          borderWidth: 0.6,
        });
        const lines = cellWrapped[cIdx] ?? [];
        for (let lIdx = 0; lIdx < lines.length; lIdx += 1) {
          cur.page.drawText(lines[lIdx] ?? '', {
            x: xCursor + 4,
            y: cur.y - 11 - lIdx * 10,
            size: 7.8,
            font: rowFont,
            color: isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.12, 0.16),
          });
        }
        xCursor += w;
      }
      cur.y = rowBottom;
    }
    cur.y -= 12;
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

  // Numérotation, pied de page Studio multi-colonnes et paraphe obligatoire sur toutes les pages
  const total = pages.length;
  const sid = input.studioIdentity;
  const footerLine1 = sid
    ? [sid.footerPostalAddress, sid.footerPhysicalAddress, sid.footerPhone, sid.footerEmail]
        .filter(Boolean)
        .join('  |  ')
    : '';
  const footerLine2 = sid
    ? [sid.footerWebsite, sid.footerBankTreasury, sid.footerLegalText]
        .filter(Boolean)
        .join('  |  ')
    : '';

  for (let i = 0; i < total; i += 1) {
    const p = pages[i]!;
    if (footerLine1 || footerLine2) {
      p.drawLine({
        start: { x: marginX, y: 44 },
        end: { x: pageWidth - marginX, y: 44 },
        thickness: 0.5,
        color: rgb(0.8, 0.84, 0.88),
      });
      if (footerLine1) {
        p.drawText(normalizeFrenchWinAnsi(footerLine1.slice(0, 108)), {
          x: marginX,
          y: 34,
          size: 6.8,
          font: fontReg,
          color: rgb(0.36, 0.42, 0.5),
        });
      }
      if (footerLine2) {
        p.drawText(normalizeFrenchWinAnsi(footerLine2.slice(0, 108)), {
          x: marginX,
          y: 25,
          size: 6.5,
          font: fontReg,
          color: rgb(0.42, 0.47, 0.54),
        });
      }
    }
    const pageTag =
      sid?.footerShowPageNumbers === false ? '' : `Page ${i + 1} / ${total}  |  `;
    const sealTag =
      sid?.footerShowVerificationUrl === false
        ? `ID : ${qrVerificationId}`
        : `Vérif : /verify/${qrVerificationId}`;
    p.drawText(
      normalizeFrenchWinAnsi(
        `${input.entityCode}  |  Paraphe : ________  |  ${pageTag}${sealTag}`
      ),
      { x: marginX, y: 15, size: 7, font: fontBold, color: primaryColor }
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
  const sid = input.studioIdentity;
  const isBilingual = sid?.headerLayout === 'BILINGUAL_SPLIT';

  const headerBlocks: Array<Paragraph | Table> = isBilingual
    ? [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: '007A5E' },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: 'RÉPUBLIQUE DU CAMEROUN', bold: true, size: 18 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: 'Paix - Travail - Patrie', italics: true, size: 16 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: sid?.tutelleFr ?? '', bold: true, size: 16 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: input.entityName, bold: true, size: 18, color: '0A1F3D' })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: sid?.emittingServiceFr ?? '', size: 16 })],
                    }),
                  ],
                }),
                new TableCell({
                  borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.SINGLE, size: 8, color: 'CE1126' },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: 'REPUBLIC OF CAMEROON', bold: true, size: 18 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: 'Peace - Work - Fatherland', italics: true, size: 16 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: sid?.tutelleEn ?? '', bold: true, size: 16 })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: input.entityName, bold: true, size: 18, color: '0A1F3D' })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: sid?.emittingServiceEn ?? '', size: 16 })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 140 }, children: [] }),
      ]
    : [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({ text: 'RÉPUBLIQUE DU CAMEROUN', bold: true, size: 22 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({ text: 'Paix - Travail - Patrie', italics: true, size: 18 }),
          ],
        }),
        ...(sid?.tutelleFr
          ? [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [new TextRun({ text: sid.tutelleFr, bold: true, size: 18 })],
              }),
            ]
          : []),
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
      ];

  const children: Array<Paragraph | Table> = [
    ...headerBlocks,
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `N° ${input.documentNumber}`, bold: true, size: 20 }),
        new TextRun({ text: `   —   ${input.city}`, size: 20 }),
        ...(sid?.taxRegistrationNumber
          ? [new TextRun({ text: `   |   NIU : ${sid.taxRegistrationNumber}`, size: 18, color: '475569' })]
          : []),
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

  const docxTables: Array<{ title?: string; rows: string[][] }> = [
    ...(input.tables ?? []),
    ...(input.tableRows && input.tableRows.length > 0 ? [{ rows: input.tableRows }] : []),
  ];

  for (const tbl of docxTables) {
    if (!tbl.rows || tbl.rows.length === 0) continue;
    if (tbl.title) {
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 80 },
          children: [new TextRun({ text: tbl.title, bold: true, size: 22, color: '0A1F3D' })],
        })
      );
    }
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tbl.rows.map(
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
              ...(sid?.footerPostalAddress || sid?.footerPhone || sid?.footerEmail
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: [
                            sid.footerPostalAddress,
                            sid.footerPhysicalAddress,
                            sid.footerPhone,
                            sid.footerEmail,
                            sid.footerWebsite,
                          ]
                            .filter(Boolean)
                            .join('  |  '),
                          size: 15,
                          color: '64748B',
                        }),
                      ],
                    }),
                  ]
                : []),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${sid?.footerLegalText ?? 'SIGAMP-CM V3.0 (TIT-CS)'}  |  Paraphe : ________  |  Page `,
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
