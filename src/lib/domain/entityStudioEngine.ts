export interface StudioDocumentBlock {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  customText?: string;
}

export interface EntityVisualIdentity {
  entityId: string;
  entityCode: string;
  entityName: string;
  entityType: string;
  municipality: string;
  primaryColor: string;
  accentColor: string;
  logoSvg?: string;
  logoUrl?: string;
  headerTimbreText: string;
  footerLegalText: string;
  typography: 'serif' | 'sans';
  compactHeader: boolean;
}

export interface StudioVersionSnapshot {
  versionId: string;
  versionNumber: number;
  label: string;
  savedAtIso: string;
  savedBy: string;
  identity: EntityVisualIdentity;
  blocks: StudioDocumentBlock[];
}

export const DEFAULT_STUDIO_BLOCKS: StudioDocumentBlock[] = [
  {
    id: 'blk_timbre',
    label: 'Timbre de la République & Armoiries',
    visible: true,
    order: 1,
    customText: '{{header.timbre}}',
  },
  {
    id: 'blk_entity',
    label: 'En-tête Institutionnelle & Logo Entité',
    visible: true,
    order: 2,
    customText: '{{entity.name}} ({{entity.code}}) — {{city}}',
  },
  {
    id: 'blk_chrono',
    label: 'Numéro Chrono, Date & Sceau QR',
    visible: true,
    order: 3,
    customText: 'Chrono N° {{chrono.sample}} — Exercice {{fiscal_year}}',
  },
  {
    id: 'blk_body',
    label: 'Corps de l’Acte / Clauses Dynamiques',
    visible: true,
    order: 4,
    customText:
      "J'ai l'honneur de vous notifier les dispositions arrêtées par {{entity.name}} au titre de l'exercice budgétaire {{fiscal_year}}.",
  },
  {
    id: 'blk_signatory',
    label: 'Bloc Signataire, Cachet & Visa',
    visible: true,
    order: 5,
    customText: 'Fait à {{city}}, le {{date.today}}\n{{signer.title}}\n{{signer.name}}',
  },
  {
    id: 'blk_ampliations',
    label: 'Ampliations & Pied de Page Légal',
    visible: true,
    order: 6,
    customText: 'Ampliations : MINMAP · ARMP · Contrôle Financier · Archives\n{{footer.legal}}',
  },
];

export const DYNAMIC_STUDIO_VARIABLES = [
  { token: '{{entity.name}}', label: 'Nom officiel de l’entité' },
  { token: '{{entity.code}}', label: 'Code entité' },
  { token: '{{city}}', label: 'Ville / Siège' },
  { token: '{{fiscal_year}}', label: 'Exercice budgétaire' },
  { token: '{{signer.title}}', label: 'Fonction du signataire' },
  { token: '{{signer.name}}', label: 'Nom du signataire' },
  { token: '{{header.timbre}}', label: 'Timbre officiel' },
  { token: '{{footer.legal}}', label: 'Mention légale entité' },
  { token: '{{chrono.sample}}', label: 'Exemple chrono' },
  { token: '{{date.today}}', label: 'Date du jour' },
];

export interface StudioVariableContext {
  entityName: string;
  entityCode: string;
  city: string;
  fiscalYear: number;
  signerTitle: string;
  signerName: string;
  headerTimbreText: string;
  footerLegalText: string;
}

export function renderStudioTemplate(
  rawText: string,
  ctx: StudioVariableContext
): string {
  const todayFr = new Date().toLocaleDateString('fr-FR');
  return rawText
    .replaceAll('{{entity.name}}', ctx.entityName)
    .replaceAll('{{entity.code}}', ctx.entityCode)
    .replaceAll('{{city}}', ctx.city)
    .replaceAll('{{fiscal_year}}', String(ctx.fiscalYear))
    .replaceAll('{{signer.title}}', ctx.signerTitle)
    .replaceAll('{{signer.name}}', ctx.signerName)
    .replaceAll('{{header.timbre}}', ctx.headerTimbreText)
    .replaceAll('{{footer.legal}}', ctx.footerLegalText)
    .replaceAll('{{chrono.sample}}', `001/SIGAMP/${ctx.entityCode}/${ctx.fiscalYear}`)
    .replaceAll('{{date.today}}', todayFr);
}

export function createStudioVersionSnapshot(params: {
  existingVersions: StudioVersionSnapshot[];
  identity: EntityVisualIdentity;
  blocks: StudioDocumentBlock[];
  savedBy: string;
  label?: string;
}): StudioVersionSnapshot[] {
  const nextNumber =
    params.existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;

  const snapshot: StudioVersionSnapshot = {
    versionId: `ver-${nextNumber}-${Date.now()}`,
    versionNumber: nextNumber,
    label: params.label ?? `Publication v${nextNumber}`,
    savedAtIso: new Date().toISOString(),
    savedBy: params.savedBy,
    identity: { ...params.identity },
    blocks: params.blocks.map((b) => ({ ...b })),
  };

  return [snapshot, ...params.existingVersions].slice(0, 15);
}

export function moveStudioBlock(
  blocks: StudioDocumentBlock[],
  blockId: string,
  direction: 'UP' | 'DOWN'
): StudioDocumentBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((b) => b.id === blockId);
  if (idx === -1) return sorted;
  const swapIdx = direction === 'UP' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return sorted;

  const tmp = sorted[idx]!;
  sorted[idx] = sorted[swapIdx]!;
  sorted[swapIdx] = tmp;

  return sorted.map((blk, i) => ({ ...blk, order: i + 1 }));
}
