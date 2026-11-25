export interface StudioDocumentBlock {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  customText?: string;
}

export type StudioHeaderLayout = 'CENTERED' | 'BILINGUAL_SPLIT';
export type StudioLogoPosition = 'LEFT' | 'CENTER' | 'DUAL';

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
  // Précision En-tête Bilingue / Institutionnel
  headerLayout?: StudioHeaderLayout;
  headerLanguage?: 'FR' | 'EN';
  logoPosition?: StudioLogoPosition;
  showTricolorBar?: boolean;
  headerTimbreTextEn?: string;
  tutelleFr?: string;
  tutelleEn?: string;
  regionDeptLineFr?: string;
  regionDeptLineEn?: string;
  emittingServiceFr?: string;
  emittingServiceEn?: string;
  taxRegistrationNumber?: string;
  budgetChapterCode?: string;
  referencePrefix?: string;
  // Précision Pied de Page Institutionnel & Traçabilité
  footerPostalAddress?: string;
  footerPhysicalAddress?: string;
  footerPhone?: string;
  footerEmail?: string;
  footerWebsite?: string;
  footerBankTreasury?: string;
  footerShowPageNumbers?: boolean;
  footerShowVerificationUrl?: boolean;
}

export interface CmsActTemplateOverride {
  actCode: string;
  label: string;
  category: string;
  enabled: boolean;
  chronoPrefix: string;
  customVisas: string;
  customClauses: string;
  requiresSealQr: boolean;
}

export interface CmsWorkflowRule {
  id: string;
  procedureLabel: string;
  thresholdRange: string;
  steps: string[];
  maxLegalDays: number;
  blockingControl: boolean;
  active: boolean;
}

export interface CmsCommissionMember {
  id: string;
  fullName: string;
  roleInCommission: string;
  organ: 'CDPM' | 'CIPM' | 'CRPM' | 'SCA';
  appointmentRef: string;
  indemnityFcfa: number;
  active: boolean;
}

export interface CmsVendorRecord {
  id: string;
  businessName: string;
  niu: string;
  rcNumber: string;
  domain: string;
  city: string;
  phone: string;
  taxStatus: 'CONFORME' | 'EXPIRE' | 'SUSPENDU_ARMP';
  blacklisted: boolean;
}

export interface CmsGedPolicyConfig {
  retentionYears: number;
  autoSealQr: boolean;
  requireDigitalSignature: boolean;
  watermarkDrafts: boolean;
  allowPublicAvisPortal: boolean;
  webhookUrl: string;
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
    label: 'Timbre de la République & Tutelle',
    visible: true,
    order: 1,
    customText: '{{header.timbre}}',
  },
  {
    id: 'blk_entity',
    label: 'En-tête Institutionnelle, Service & Logo',
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

export const DEFAULT_CMS_ACT_TEMPLATES: CmsActTemplateOverride[] = [
  {
    actCode: 'ACT-DAO-AONO',
    label: 'Avis d’Appel d’Offres National Ouvert (AAO)',
    category: 'Passation & Publicité',
    enabled: true,
    chronoPrefix: 'AAO/SIGAMP',
    customVisas: 'Vu le Décret N° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
    customClauses: 'Délai minimum de remise des offres : 21 à 30 jours calendaires.',
    requiresSealQr: true,
  },
  {
    actCode: 'ACT-DC-COTATION',
    label: 'Dossier de Demande de Cotation (DC)',
    category: 'Consultations Simplifiées',
    enabled: true,
    chronoPrefix: 'DC/SIGAMP',
    customVisas: 'Vu les seuils réglementaires des Lettres-Commandes (< 30M FCFA)',
    customClauses: 'Minimum 03 soumissionnaires consultés, attribution au moins-disant conforme.',
    requiresSealQr: true,
  },
  {
    actCode: 'ACT-DEC-ATTRIB',
    label: 'Décision d’Attribution du Marché',
    category: 'Attribution & Standstill',
    enabled: true,
    chronoPrefix: 'DA/MO',
    customVisas: 'Vu la proposition motivée de la Commission compétente (CDPM/CIPM)',
    customClauses: 'Délai d’attente (standstill) de 05 jours ouvrables avant signature.',
    requiresSealQr: true,
  },
  {
    actCode: 'ACT-OS-DEMARRAGE',
    label: 'Ordre de Service de Démarrage des Travaux/Prestations',
    category: 'Exécution & Suivi',
    enabled: true,
    chronoPrefix: 'OS/ING',
    customVisas: 'Vu le marché enregistré et notifié au titulaire',
    customClauses: 'Le délai contractuel court à compter du lendemain de la notification.',
    requiresSealQr: true,
  },
  {
    actCode: 'ACT-DECOMPTE-PRO',
    label: 'Décompte Provisoire & Certificat de Paiement',
    category: 'Exécution Financière',
    enabled: true,
    chronoPrefix: 'DP/CF',
    customVisas: 'Vu les attachements contradictoires certifiés par l’Ingénieur du Marché',
    customClauses: 'Application TVA 19,25 %, retenue de garantie 10 % et AIR/IS selon régime.',
    requiresSealQr: true,
  },
  {
    actCode: 'ACT-PV-RECEP-PROV',
    label: 'Procès-Verbal de Réception Provisoire / Définitive',
    category: 'Réceptions & Clôture',
    enabled: true,
    chronoPrefix: 'PVR/MO',
    customVisas: 'Vu les constatations techniques de la Commission de Réception',
    customClauses: 'Libération de la retenue de garantie à l’expiration du délai de garantie (12 mois).',
    requiresSealQr: true,
  },
];

export const DEFAULT_CMS_WORKFLOW_RULES: CmsWorkflowRule[] = [
  {
    id: 'wf-bca',
    procedureLabel: 'Bon de Commande Administratif (BCA)',
    thresholdRange: '< 5 000 000 FCFA',
    steps: ['Service Demandeur', 'SIGAMP / Contrôle Prix', 'Contrôleur Financier', 'Ordonnateur (Signature)'],
    maxLegalDays: 7,
    blockingControl: true,
    active: true,
  },
  {
    id: 'wf-dc',
    procedureLabel: 'Demande de Cotation (DC)',
    thresholdRange: '5 000 000 – 29 999 999 FCFA',
    steps: ['Maturation & Mercuriale', 'SIGAMP (Montage DC)', 'Consultation ≥ 3 prestataires', 'CDPM/CIPM (Dépouillement)', 'Ordonnateur (Attribution)', 'Visa CF & Signature'],
    maxLegalDays: 21,
    blockingControl: true,
    active: true,
  },
  {
    id: 'wf-lc',
    procedureLabel: 'Lettre-Commande (AONO)',
    thresholdRange: '30 000 000 – 49 999 999 FCFA',
    steps: ['Maturation complète', 'Ingénieur & CCTP', 'CDPM/CIPM (Examen DAO)', 'Publication ARMP (21j)', 'SCA & Commission', 'Standstill 5j & Visa Tutelle'],
    maxLegalDays: 45,
    blockingControl: true,
    active: true,
  },
  {
    id: 'wf-marche',
    procedureLabel: 'Marché Public (AONO / CCCM)',
    thresholdRange: '≥ 50 000 000 FCFA',
    steps: ['Maturation & EIES', 'Ingénieur & Devis Confidentiel', 'Commission Passation (+ CCCM si seuil)', 'Publication JMP/ARMP (30j)', 'SCA Isolée & OAB', 'Attribution & Standstill 5j', 'Visas CF / Tutelle / Enregistrement'],
    maxLegalDays: 75,
    blockingControl: true,
    active: true,
  },
];

export const DEFAULT_CMS_COMMISSION_MEMBERS: CmsCommissionMember[] = [
  {
    id: 'mem-01',
    fullName: 'M. Jean-Paul Nkeng',
    roleInCommission: 'Président de Commission',
    organ: 'CDPM',
    appointmentRef: 'Arrêté N° 014/MINMAP/2026',
    indemnityFcfa: 150_000,
    active: true,
  },
  {
    id: 'mem-02',
    fullName: 'Mme Clarisse Ngo Mbock',
    roleInCommission: 'Secrétaire / SIGAMP',
    organ: 'CDPM',
    appointmentRef: 'Décision N° 008/MO/2026',
    indemnityFcfa: 100_000,
    active: true,
  },
  {
    id: 'mem-03',
    fullName: 'M. Rodrigue Tchoumbou',
    roleInCommission: 'Président Sous-Commission d’Analyse',
    organ: 'SCA',
    appointmentRef: 'Note de Service N° 022/CDPM/2026',
    indemnityFcfa: 100_000,
    active: true,
  },
];

export const DEFAULT_CMS_VENDORS: CmsVendorRecord[] = [
  {
    id: 'vnd-01',
    businessName: 'ETS CAM-INFRASTRUCTURES SARL',
    niu: 'M041912884512K',
    rcNumber: 'RC/YAE/2019/B/1142',
    domain: 'BTP & VRD',
    city: 'Yaoundé',
    phone: '(+237) 699 00 11 22',
    taxStatus: 'CONFORME',
    blacklisted: false,
  },
  {
    id: 'vnd-02',
    businessName: 'SOLUTIONS NUMÉRIQUES DU CAMEROUN SA',
    niu: 'M082114559018P',
    rcNumber: 'RC/DLA/2021/B/0481',
    domain: 'TIC & Équipements Bureautiques',
    city: 'Douala',
    phone: '(+237) 677 44 55 66',
    taxStatus: 'CONFORME',
    blacklisted: false,
  },
];

export const DEFAULT_CMS_GED_POLICY: CmsGedPolicyConfig = {
  retentionYears: 10,
  autoSealQr: true,
  requireDigitalSignature: true,
  watermarkDrafts: true,
  allowPublicAvisPortal: true,
  webhookUrl: '',
};

export const DYNAMIC_STUDIO_VARIABLES = [
  { token: '{{entity.name}}', label: 'Nom officiel de l’entité' },
  { token: '{{entity.code}}', label: 'Code entité' },
  { token: '{{city}}', label: 'Ville / Siège' },
  { token: '{{fiscal_year}}', label: 'Exercice budgétaire' },
  { token: '{{signer.title}}', label: 'Fonction du signataire' },
  { token: '{{signer.name}}', label: 'Nom du signataire' },
  { token: '{{header.timbre}}', label: 'Timbre officiel' },
  { token: '{{tutelle.fr}}', label: 'Ministère / Tutelle (FR)' },
  { token: '{{service.fr}}', label: 'Service émetteur (FR)' },
  { token: '{{niu}}', label: 'NIU / Immatriculation' },
  { token: '{{footer.contacts}}', label: 'Coordonnées pied de page' },
  { token: '{{footer.bank}}', label: 'Compte Trésor / Bancaire' },
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
  tutelleFr?: string;
  emittingServiceFr?: string;
  taxRegistrationNumber?: string;
  footerContacts?: string;
  footerBankTreasury?: string;
  referencePrefix?: string;
}

export function renderStudioTemplate(
  rawText: string,
  ctx: StudioVariableContext
): string {
  const todayFr = new Date().toLocaleDateString('fr-FR');
  const prefix = ctx.referencePrefix?.trim() || `SIGAMP/${ctx.entityCode}`;
  return rawText
    .replaceAll('{{entity.name}}', ctx.entityName)
    .replaceAll('{{entity.code}}', ctx.entityCode)
    .replaceAll('{{city}}', ctx.city)
    .replaceAll('{{fiscal_year}}', String(ctx.fiscalYear))
    .replaceAll('{{signer.title}}', ctx.signerTitle)
    .replaceAll('{{signer.name}}', ctx.signerName)
    .replaceAll('{{header.timbre}}', ctx.headerTimbreText)
    .replaceAll('{{tutelle.fr}}', ctx.tutelleFr ?? '')
    .replaceAll('{{service.fr}}', ctx.emittingServiceFr ?? '')
    .replaceAll('{{niu}}', ctx.taxRegistrationNumber ?? '')
    .replaceAll('{{footer.contacts}}', ctx.footerContacts ?? '')
    .replaceAll('{{footer.bank}}', ctx.footerBankTreasury ?? '')
    .replaceAll('{{footer.legal}}', ctx.footerLegalText)
    .replaceAll('{{chrono.sample}}', `001/${prefix}/${ctx.fiscalYear}`)
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
