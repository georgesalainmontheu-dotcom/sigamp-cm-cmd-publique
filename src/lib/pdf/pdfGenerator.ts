import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { RbacRole } from '../../types/domain';
import { computeSha256Hex } from '../offline/offlineStore';

/**
 * Moteur de Génération de Documents Officiels PDF, Filigrane, QR Code & Scellé SHA-256 (Jalon 4)
 * Fonctionne côté navigateur (PWA offline) et côté serveur (Next.js / Node.js).
 */

export type OfficialPdfDocumentType =
  | 'DAO'
  | 'ORDRE_SERVICE'
  | 'PV_OUVERTURE'
  | 'DECOMPTE'
  | 'ETAT_INDEMNITES'
  | 'CORRESPONDANCE';

export interface PdfTableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

export interface PdfStructuredTable {
  title?: string;
  columns: PdfTableColumn[];
  rows: string[][];
}

export interface OfficialPdfInput {
  documentType: OfficialPdfDocumentType;
  documentNumber: string;
  title: string;
  subtitle?: string;
  entityId: string;
  entityName: string;
  entityCode: string;
  city: string;
  projectCode?: string;
  signatoryTitle: string;
  signatoryName: string;
  actorUserId: string;
  actorRole: RbacRole;
  recordTableName: string;
  recordId: string;
  statusLabel?: 'BROUILLON' | 'VALIDE' | 'SIGNE' | 'ORIGINAL CERTIFIE';
  watermarkText?: string;
  paragraphs: string[];
  table?: PdfStructuredTable;
  ampliations?: string[];
  verificationBaseUrl?: string;
  issuedAtIso?: string;
}

export interface GeneratedPdfAuditLogPayload {
  entity_id: string;
  actor_user_id: string;
  actor_role: RbacRole;
  action: 'SEAL';
  table_name: string;
  record_id: string;
  new_data: {
    document_type: OfficialPdfDocumentType;
    document_number: string;
    qr_verification_id: string;
    sha256_seal: string;
    issued_at: string;
  };
}

export interface GeneratedOfficialPdfResult {
  pdfBytes: Uint8Array;
  fileName: string;
  qrVerificationId: string;
  qrPayloadJson: string;
  qrDataUrl: string;
  sha256Seal: string;
  pageCount: number;
  issuedAtIso: string;
  auditLogEntry: GeneratedPdfAuditLogPayload;
}

/**
 * Normalise les caractères spéciaux français/Unicode pour l'encodage WinAnsi des polices PDF standard.
 */
export function sanitizeWinAnsiText(raw: string): string {
  return raw
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/[’‘‚]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/€/g, 'EUR')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
}

function wrapTextLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const clean = sanitizeWinAnsiText(text);
  const rawParagraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of rawParagraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function generateUuidV4(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function generateOfficialPdf(
  input: OfficialPdfInput
): Promise<GeneratedOfficialPdfResult> {
  const issuedAtIso = input.issuedAtIso ?? new Date().toISOString();
  const qrVerificationId = generateUuidV4();

  // 1. Calcul préliminaire de l'empreinte canonique du contenu métier
  const canonicalPayload = JSON.stringify({
    documentType: input.documentType,
    documentNumber: input.documentNumber,
    entityId: input.entityId,
    entityCode: input.entityCode,
    projectCode: input.projectCode ?? null,
    title: input.title,
    paragraphs: input.paragraphs,
    table: input.table ?? null,
    issuedAtIso,
    qrVerificationId,
  });
  const contentSha256 = await computeSha256Hex(canonicalPayload);

  // 2. Génération du QR Code de vérification embarqué dans le PDF
  const verificationBase = input.verificationBaseUrl ?? 'https://commande-publique.cm/verify';
  const qrPayloadJson = JSON.stringify({
    vid: qrVerificationId,
    doc: input.documentNumber,
    type: input.documentType,
    ent: input.entityCode,
    sha: contentSha256.slice(0, 16),
    url: `${verificationBase}?id=${qrVerificationId}`,
  });

  const qrDataUrl = await QRCode.toDataURL(qrPayloadJson, {
    width: 180,
    margin: 1,
    color: { dark: '#0A1F3D', light: '#FFFFFF' },
  });
  const qrPngBytes = dataUrlToUint8Array(qrDataUrl);

  // 3. Construction du document PDF A4 avec pdf-lib
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(sanitizeWinAnsiText(`${input.documentType} - ${input.documentNumber}`));
  pdfDoc.setAuthor(sanitizeWinAnsiText(input.entityName));
  pdfDoc.setSubject(sanitizeWinAnsiText(input.title));
  pdfDoc.setCreator('SIGAMP-CM PWA Local-First');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await pdfDoc.embedPng(qrPngBytes);

  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const MARGIN = 44;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const NAVY = rgb(10 / 255, 31 / 255, 61 / 255);
  const GOLD = rgb(212 / 255, 175 / 255, 55 / 255);
  const EMERALD = rgb(0 / 255, 122 / 255, 94 / 255);
  const SLATE = rgb(71 / 255, 85 / 255, 105 / 255);
  const LIGHT_BG = rgb(244 / 255, 246 / 255, 249 / 255);

  const watermarkLabel = sanitizeWinAnsiText(
    input.watermarkText ?? input.statusLabel ?? 'ORIGINAL CERTIFIE'
  );

  const drawWatermarkAndChrome = (page: PDFPage, pageIndex: number) => {
    // Filigrane diagonal discret
    page.drawText(watermarkLabel, {
      x: 110,
      y: 340,
      size: 42,
      font: fontBold,
      color: rgb(0.88, 0.9, 0.93),
      rotate: degrees(35),
      opacity: 0.45,
    });

    // Bandeau supérieur sur la page 1
    if (pageIndex === 0) {
      page.drawRectangle({
        x: 0,
        y: PAGE_H - 74,
        width: PAGE_W,
        height: 74,
        color: NAVY,
      });
      page.drawRectangle({
        x: 0,
        y: PAGE_H - 78,
        width: PAGE_W,
        height: 4,
        color: GOLD,
      });

      page.drawText('REPUBLIQUE DU CAMEROUN', {
        x: MARGIN,
        y: PAGE_H - 26,
        size: 10,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('Paix - Travail - Patrie', {
        x: MARGIN,
        y: PAGE_H - 40,
        size: 8.5,
        font: fontRegular,
        color: GOLD,
      });
      page.drawText(sanitizeWinAnsiText(input.entityName.toUpperCase()), {
        x: MARGIN,
        y: PAGE_H - 58,
        size: 11,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      const badgeText = sanitizeWinAnsiText(input.documentType);
      const badgeW = Math.max(92, fontBold.widthOfTextAtSize(badgeText, 9) + 20);
      page.drawRectangle({
        x: PAGE_W - MARGIN - badgeW,
        y: PAGE_H - 46,
        width: badgeW,
        height: 22,
        color: EMERALD,
      });
      page.drawText(badgeText, {
        x: PAGE_W - MARGIN - badgeW + 10,
        y: PAGE_H - 38,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
    }
  };

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  drawWatermarkAndChrome(page, 0);
  let y = PAGE_H - 105;

  const ensureSpace = (neededHeight: number) => {
    if (y - neededHeight < 120) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      drawWatermarkAndChrome(page, pdfDoc.getPageCount() - 1);
      y = PAGE_H - 55;
    }
  };

  // Cartouche Métadonnées du Document
  page.drawRectangle({
    x: MARGIN,
    y: y - 54,
    width: CONTENT_W,
    height: 58,
    color: LIGHT_BG,
    borderColor: rgb(0.82, 0.85, 0.9),
    borderWidth: 1,
  });

  page.drawText(sanitizeWinAnsiText(`Document N° : ${input.documentNumber}`), {
    x: MARGIN + 12,
    y: y - 16,
    size: 10,
    font: fontBold,
    color: NAVY,
  });
  page.drawText(
    sanitizeWinAnsiText(
      `Lieu & Date : ${input.city}, le ${issuedAtIso.slice(0, 10)}`
    ),
    {
      x: PAGE_W / 2 + 10,
      y: y - 16,
      size: 9.5,
      font: fontRegular,
      color: SLATE,
    }
  );
  page.drawText(
    sanitizeWinAnsiText(
      `Dossier : ${input.projectCode ?? 'N/A'} | Statut : ${
        input.statusLabel ?? 'ORIGINAL CERTIFIE'
      }`
    ),
    {
      x: MARGIN + 12,
      y: y - 34,
      size: 9,
      font: fontRegular,
      color: SLATE,
    }
  );
  page.drawText(sanitizeWinAnsiText(`ID Verification : ${qrVerificationId}`), {
    x: MARGIN + 12,
    y: y - 48,
    size: 8,
    font: fontRegular,
    color: SLATE,
  });

  y -= 78;

  // Titre & Sous-titre
  for (const titleLine of wrapTextLines(input.title, fontBold, 13.5, CONTENT_W)) {
    ensureSpace(20);
    page.drawText(titleLine, {
      x: MARGIN,
      y,
      size: 13.5,
      font: fontBold,
      color: NAVY,
    });
    y -= 18;
  }

  if (input.subtitle) {
    for (const subLine of wrapTextLines(input.subtitle, fontRegular, 10, CONTENT_W)) {
      ensureSpace(16);
      page.drawText(subLine, {
        x: MARGIN,
        y,
        size: 10,
        font: fontRegular,
        color: SLATE,
      });
      y -= 14;
    }
  }

  y -= 8;

  // Paragraphes métier
  for (const para of input.paragraphs) {
    const wrapped = wrapTextLines(para, fontRegular, 9.8, CONTENT_W);
    for (const line of wrapped) {
      ensureSpace(15);
      if (line) {
        page.drawText(line, {
          x: MARGIN,
          y,
          size: 9.8,
          font: fontRegular,
          color: rgb(0.12, 0.14, 0.18),
        });
      }
      y -= 14;
    }
    y -= 6;
  }

  // Tableau structuré optionnel (Décompte / Indemnités / PV)
  if (input.table && input.table.columns.length > 0) {
    ensureSpace(54);
    if (input.table.title) {
      page.drawText(sanitizeWinAnsiText(input.table.title), {
        x: MARGIN,
        y,
        size: 10.5,
        font: fontBold,
        color: NAVY,
      });
      y -= 18;
    }

    // En-tête tableau
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: CONTENT_W,
      height: 20,
      color: NAVY,
    });
    let colX = MARGIN + 6;
    for (const col of input.table.columns) {
      page.drawText(sanitizeWinAnsiText(col.header), {
        x: colX,
        y: y - 10,
        size: 8.5,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      colX += col.width;
    }
    y -= 22;

    for (let rIdx = 0; rIdx < input.table.rows.length; rIdx++) {
      ensureSpace(22);
      const row = input.table.rows[rIdx]!;
      if (rIdx % 2 === 0) {
        page.drawRectangle({
          x: MARGIN,
          y: y - 13,
          width: CONTENT_W,
          height: 18,
          color: LIGHT_BG,
        });
      }
      let cellX = MARGIN + 6;
      for (let cIdx = 0; cIdx < input.table.columns.length; cIdx++) {
        const col = input.table.columns[cIdx]!;
        const cellVal = sanitizeWinAnsiText(row[cIdx] ?? '');
        const clipped =
          cellVal.length > 42 ? `${cellVal.slice(0, 39)}...` : cellVal;
        page.drawText(clipped, {
          x: cellX,
          y: y - 8,
          size: 8.3,
          font: fontRegular,
          color: rgb(0.15, 0.18, 0.22),
        });
        cellX += col.width;
      }
      y -= 18;
    }
    y -= 12;
  }

  // Bloc Signature & Ampliations
  ensureSpace(110);
  page.drawText(sanitizeWinAnsiText(input.signatoryTitle), {
    x: PAGE_W - MARGIN - 210,
    y,
    size: 9.5,
    font: fontBold,
    color: NAVY,
  });
  y -= 16;
  page.drawText(sanitizeWinAnsiText(input.signatoryName), {
    x: PAGE_W - MARGIN - 210,
    y,
    size: 9.5,
    font: fontRegular,
    color: SLATE,
  });

  if (input.ampliations && input.ampliations.length > 0) {
    let ampY = y + 16;
    page.drawText('Ampliations :', {
      x: MARGIN,
      y: ampY,
      size: 8.5,
      font: fontBold,
      color: SLATE,
    });
    for (const amp of input.ampliations.slice(0, 5)) {
      ampY -= 12;
      page.drawText(sanitizeWinAnsiText(`- ${amp}`), {
        x: MARGIN,
        y: ampY,
        size: 8,
        font: fontRegular,
        color: SLATE,
      });
    }
  }

  // 4. Bloc Cryptographique QR + SHA-256 en pied de dernière page
  const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
  lastPage.drawRectangle({
    x: MARGIN,
    y: 28,
    width: CONTENT_W,
    height: 70,
    color: LIGHT_BG,
    borderColor: GOLD,
    borderWidth: 1,
  });

  lastPage.drawImage(qrImage, {
    x: PAGE_W - MARGIN - 64,
    y: 33,
    width: 60,
    height: 60,
  });

  lastPage.drawText('SCELLE CRYPTOGRAPHIQUE & VERIFICATION D’AUTHENTICITE', {
    x: MARGIN + 10,
    y: 82,
    size: 8.2,
    font: fontBold,
    color: NAVY,
  });
  lastPage.drawText(
    sanitizeWinAnsiText(`Empreinte SHA-256 : ${contentSha256}`),
    {
      x: MARGIN + 10,
      y: 66,
      size: 7.5,
      font: fontRegular,
      color: SLATE,
    }
  );
  lastPage.drawText(
    sanitizeWinAnsiText(
      `QR ID : ${qrVerificationId} | Horodatage : ${issuedAtIso}`
    ),
    {
      x: MARGIN + 10,
      y: 52,
      size: 7.5,
      font: fontRegular,
      color: SLATE,
    }
  );
  lastPage.drawText(
    'Scannez le QR Code pour verifier ce document dans le registre immutable audit_logs.',
    {
      x: MARGIN + 10,
      y: 38,
      size: 7.3,
      font: fontRegular,
      color: EMERALD,
    }
  );

  // Numérotation des pages
  const totalPages = pdfDoc.getPageCount();
  for (let p = 0; p < totalPages; p++) {
    const pg = pdfDoc.getPage(p);
    pg.drawText(`Page ${p + 1} / ${totalPages}`, {
      x: PAGE_W - MARGIN - 55,
      y: 12,
      size: 7.5,
      font: fontRegular,
      color: SLATE,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const safeDocNum = input.documentNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${input.documentType}_${safeDocNum}.pdf`;

  const auditLogEntry: GeneratedPdfAuditLogPayload = {
    entity_id: input.entityId,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    action: 'SEAL',
    table_name: input.recordTableName,
    record_id: input.recordId,
    new_data: {
      document_type: input.documentType,
      document_number: input.documentNumber,
      qr_verification_id: qrVerificationId,
      sha256_seal: contentSha256,
      issued_at: issuedAtIso,
    },
  };

  return {
    pdfBytes,
    fileName,
    qrVerificationId,
    qrPayloadJson,
    qrDataUrl,
    sha256Seal: contentSha256,
    pageCount: totalPages,
    issuedAtIso,
    auditLogEntry,
  };
}
