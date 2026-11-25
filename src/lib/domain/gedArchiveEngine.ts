import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { computeSha256Hex } from '../offline/offlineStore';
import type { RbacRole } from '../../types/domain';

export type GedFolderCode =
  | '01_MATURATION_BUDGET'
  | '02_LANCEMENT_DAO_DC'
  | '03_OUVERTURE_ANALYSE'
  | '04_CONTRAT_ENREGISTREMENT'
  | '05_EXECUTION_FINANCES'
  | '06_RECEPTIONS_CLOTURE_CONTENTIEUX'
  | '00_CORRESPONDANCES_GENERALES';

export type GedLifecycleStatus = 'BROUILLON' | 'VALIDE' | 'SIGNE_SCELLE' | 'ARCHIVE';

export interface GedFolderDefinition {
  code: GedFolderCode;
  sortOrder: number;
  label: string;
  description: string;
  requiredPiecesHint: string[];
}

export const GED_FOLDER_DEFINITIONS: GedFolderDefinition[] = [
  {
    code: '01_MATURATION_BUDGET',
    sortOrder: 1,
    label: '01. Maturation & Budget',
    description: 'Inscription budgétaire, certificat de disponibilité des crédits, site/foncier, études préalables & devis confidentiel.',
    requiredPiecesHint: ['Note de maturation', 'Certificat disponibilité crédits', 'Études préalables', 'Devis confidentiel (cloisonné)'],
  },
  {
    code: '02_LANCEMENT_DAO_DC',
    sortOrder: 2,
    label: '02. Lancement, DAO & Demande de Cotation',
    description: 'Note de présentation, avis CPM, DAO/DC complet, AAO bilingue, additifs & registre de retrait.',
    requiredPiecesHint: ['Note de présentation DCE', 'PV examen DCE', 'DAO / Dossier DC', 'AAO / Avis de cotation', 'Additifs éventuels'],
  },
  {
    code: '03_OUVERTURE_ANALYSE',
    sortOrder: 3,
    label: '03. Ouverture, Analyse & Attribution',
    description: 'Registre dépôt plis, PV ouverture, rapport SCA, proposition attribution CPM, avis CCCM & décision attribution.',
    requiredPiecesHint: ['PV d’ouverture des plis', 'Rapport SCA', 'PV attribution CPM', 'Avis CCCM', 'Décision d’attribution', 'Notifications'],
  },
  {
    code: '04_CONTRAT_ENREGISTREMENT',
    sortOrder: 4,
    label: '04. Contrat, Cautions & Enregistrement',
    description: 'Projet de marché/LC, visa CF, marché/LC timbré et enregistré aux Impôts, cautions bancaires COBAC.',
    requiredPiecesHint: ['Visa Contrôleur Financier', 'Marché / Lettre-Commande signé', 'Quittance enregistrement', 'Caution bonne exécution'],
  },
  {
    code: '05_EXECUTION_FINANCES',
    sortOrder: 5,
    label: '05. Exécution, OS, Décomptes & Avenants',
    description: 'Ordres de service, journal de chantier, attachements, décomptes provisoires/DGD, avenants & mises en demeure.',
    requiredPiecesHint: ['OS de démarrage', 'Attachements contradictoires', 'Décomptes provisoires', 'Avenants éventuels', 'Décompte final / DGD'],
  },
  {
    code: '06_RECEPTIONS_CLOTURE_CONTENTIEUX',
    sortOrder: 6,
    label: '06. Réceptions, Clôture & Contentieux',
    description: 'PV pré-réception, PV réception provisoire/définitive, attestation bonne exécution, mainlevées & recours CER/ARMP.',
    requiredPiecesHint: ['PV Réception Provisoire', 'PV Réception Définitive', 'Attestation bonne fin', 'Mainlevée cautions', 'Dossiers recours'],
  },
  {
    code: '00_CORRESPONDANCES_GENERALES',
    sortOrder: 7,
    label: '00. Correspondances & Rapports Périodiques',
    description: 'Bordereaux de transmission, saisines institutionnelles, rapports périodiques SIGAMP/CPM/OI.',
    requiredPiecesHint: ['Bordereaux de transmission', 'Saisines CPM/MINMAP/ARMP', 'Rapports périodiques'],
  },
];

export interface GedDocumentRecord {
  id: string;
  entity_id: string;
  project_id: string | null;
  folder_code: GedFolderCode;
  document_category: string;
  act_code?: string | null;
  title: string;
  chrono_number?: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  version_number: number;
  lifecycle_status: GedLifecycleStatus;
  storage_path?: string | null;
  content_text?: string | null;
  qr_verification_id?: string | null;
  actor_role?: RbacRole | null;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export function resolveGedFolderForAct(actCodeOrCategory: string): GedFolderCode {
  const key = actCodeOrCategory.toUpperCase();
  if (key.includes('MATURATION') || key.includes('CREDIT') || key.includes('DEVIS_CONFIDENTIEL')) {
    return '01_MATURATION_BUDGET';
  }
  if (
    key.includes('DAO') ||
    key.includes('COTATION') ||
    key.includes('AAO') ||
    key.includes('AAMI') ||
    key.includes('ADDITIF') ||
    key.includes('NOTE_PRESENTATION_DCE') ||
    key.includes('SAISINE') ||
    key.includes('ECLAIRCISSEMENT')
  ) {
    return '02_LANCEMENT_DAO_DC';
  }
  if (
    key.includes('OUVERTURE') ||
    key.includes('SCA') ||
    key.includes('ATTRIBUTION') ||
    key.includes('REJET') ||
    key.includes('INFRUCTUEUX') ||
    key.includes('CCCM') ||
    key.includes('CONVOCATION') ||
    key.includes('SOUMISSION') ||
    key.includes('DECLARATION')
  ) {
    return '03_OUVERTURE_ANALYSE';
  }
  if (
    key.includes('MARCHE') ||
    key.includes('LETTRE_COMMANDE') ||
    key.includes('VISA') ||
    key.includes('CAUTION') ||
    key.includes('NOTIFICATION_CONTRAT') ||
    key.includes('GROUPEMENT')
  ) {
    return '04_CONTRAT_ENREGISTREMENT';
  }
  if (
    key.includes('ORDRE_SERVICE') ||
    key.includes('DECOMPTE') ||
    key.includes('ATTACHEMENT') ||
    key.includes('AVENANT') ||
    key.includes('MISE_EN_DEMEURE') ||
    key.includes('RESILIATION') ||
    key.includes('JOURNAL_CHANTIER') ||
    key.includes('FACTURE')
  ) {
    return '05_EXECUTION_FINANCES';
  }
  if (
    key.includes('RECEPTION') ||
    key.includes('RECETTE') ||
    key.includes('BONNE_') ||
    key.includes('MAINLEVEE') ||
    key.includes('RECOURS') ||
    key.includes('CER') ||
    key.includes('ARMP') ||
    key.includes('SUSPENSION')
  ) {
    return '06_RECEPTIONS_CLOTURE_CONTENTIEUX';
  }
  return '00_CORRESPONDANCES_GENERALES';
}

export function searchGedDocumentsLocal(
  docs: GedDocumentRecord[],
  filters: {
    projectId?: string | null;
    folderCode?: GedFolderCode | 'ALL';
    status?: GedLifecycleStatus | 'ALL';
    query?: string;
  }
): GedDocumentRecord[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  return docs.filter((d) => {
    if (filters.projectId && d.project_id !== filters.projectId) return false;
    if (filters.folderCode && filters.folderCode !== 'ALL' && d.folder_code !== filters.folderCode) {
      return false;
    }
    if (filters.status && filters.status !== 'ALL' && d.lifecycle_status !== filters.status) {
      return false;
    }
    if (!q) return true;
    const hay = `${d.title} ${d.chrono_number ?? ''} ${d.file_name} ${d.act_code ?? ''} ${d.content_text ?? ''} ${d.sha256_hash}`.toLowerCase();
    return hay.includes(q);
  });
}

export async function buildAuditDossierCoverPdf(input: {
  entityName: string;
  projectCode: string;
  projectTitle: string;
  documents: GedDocumentRecord[];
}): Promise<{ pdfBytes: Uint8Array; sha256: string }> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([595.28, 841.89]);
  page.drawRectangle({ x: 0, y: 745, width: 595.28, height: 97, color: rgb(0.04, 0.12, 0.24) });
  page.drawText('REPUBLIQUE DU CAMEROUN - ARCHIVE REGALIENNE GED', {
    x: 40,
    y: 805,
    size: 11,
    font: fontBold,
    color: rgb(0.83, 0.69, 0.22),
  });
  page.drawText(`CHEMISE COMPLETE D'AUDIT CONSUPE / ARMP / MINMAP`, {
    x: 40,
    y: 782,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${input.entityName} | Projet : ${input.projectCode}`, {
    x: 40,
    y: 760,
    size: 10,
    font: fontReg,
    color: rgb(0.9, 0.92, 0.96),
  });

  let y = 715;
  page.drawText(`Objet : ${input.projectTitle.slice(0, 85)}`, {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.04, 0.12, 0.24),
  });
  y -= 24;
  page.drawText(`Nombre total de pieces archivees : ${input.documents.length}`, {
    x: 40,
    y,
    size: 10,
    font: fontReg,
    color: rgb(0.2, 0.25, 0.3),
  });
  y -= 22;

  for (let i = 0; i < Math.min(input.documents.length, 24); i += 1) {
    const doc = input.documents[i]!;
    const line = `${i + 1}. [${doc.folder_code}] ${doc.title.slice(0, 48)} | v${doc.version_number} | ${doc.lifecycle_status}`;
    page.drawText(line, { x: 40, y, size: 8.5, font: fontBold, color: rgb(0.08, 0.1, 0.15) });
    y -= 12;
    page.drawText(
      `   Fichier: ${doc.file_name} | Chrono: ${doc.chrono_number ?? 'N/A'} | SHA256: ${doc.sha256_hash.slice(0, 24)}...`,
      { x: 40, y, size: 7.5, font: fontReg, color: rgb(0.35, 0.4, 0.48) }
    );
    y -= 15;
    if (y < 70) break;
  }

  page.drawText(
    'Genere par SIGAMP-CM V3.0 (TIT-Consulting Solutions) - Integrite horodatee et tracabilite SHA-256.',
    { x: 40, y: 32, size: 8, font: fontReg, color: rgb(0.4, 0.45, 0.5) }
  );

  const pdfBytes = await pdfDoc.save();
  const sha256 = await computeSha256Hex(pdfBytes);
  return { pdfBytes, sha256 };
}
