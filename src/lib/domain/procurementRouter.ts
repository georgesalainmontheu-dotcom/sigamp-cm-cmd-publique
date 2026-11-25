import type {
  CommissionType,
  ContractType,
  EntityType,
  ProcurementMode,
  ProcurementNature,
} from '../../types/domain';

/**
 * Moteur 1 : Routage Procédural & Seuils CMP (Décret n° 2018/366 du 20 juin 2018
 * et Décret n° 2013/271 relatif aux Commissions de Passation et CCCM).
 */

export interface CmpThresholdsConfig {
  bcaMaxExclusiveFcfa: number;          // < 5 000 000 FCFA
  dcCotationMaxExclusiveFcfa: number;   // < 30 000 000 FCFA (Fournitures/Services simples) ou 50M selon catégorie
  lettreCommandeMaxExclusiveFcfa: number; // < 50 000 000 FCFA
  cccmThresholdsFcfa: Record<ProcurementNature, number>;
  offerValidityDays: number;            // 90 jours CMP
  standstillBusinessDays: number;       // 5 jours ouvrables CMP
  addendumMinNoticeDays: number;        // 7 jours avant ouverture
}

export const DEFAULT_CMP_THRESHOLDS: CmpThresholdsConfig = {
  bcaMaxExclusiveFcfa: 5_000_000,
  dcCotationMaxExclusiveFcfa: 30_000_000,
  lettreCommandeMaxExclusiveFcfa: 50_000_000,
  cccmThresholdsFcfa: {
    TRAVAUX: 500_000_000,
    FOURNITURES: 250_000_000,
    SERVICES_QUANTIFIABLES: 100_000_000,
    PRESTATIONS_INTELLECTUELLES: 100_000_000,
  },
  offerValidityDays: 90,
  standstillBusinessDays: 5,
  addendumMinNoticeDays: 7,
};

export interface NatureThresholdRule {
  bcaMaxExclusiveFcfa: number;
  dcCotationMaxExclusiveFcfa: number | null;
  lettreCommandeMaxExclusiveFcfa: number;
  marcheMinFcfa: number;
  cccmThresholdFcfa: number;
  cccmOrgan: CommissionType;
}

/**
 * Matrice réglementaire stricte par nature de prestation (Décret n° 2018/366 & Décret 2013/271).
 */
export const CMP_NATURE_THRESHOLDS: Record<ProcurementNature, NatureThresholdRule> = {
  TRAVAUX: {
    bcaMaxExclusiveFcfa: 5_000_000,
    dcCotationMaxExclusiveFcfa: null,
    lettreCommandeMaxExclusiveFcfa: 50_000_000,
    marcheMinFcfa: 50_000_000,
    cccmThresholdFcfa: 500_000_000,
    cccmOrgan: 'CCCM_TR',
  },
  FOURNITURES: {
    bcaMaxExclusiveFcfa: 5_000_000,
    dcCotationMaxExclusiveFcfa: 30_000_000,
    lettreCommandeMaxExclusiveFcfa: 50_000_000,
    marcheMinFcfa: 50_000_000,
    cccmThresholdFcfa: 250_000_000,
    cccmOrgan: 'CCCM_AG',
  },
  SERVICES_QUANTIFIABLES: {
    bcaMaxExclusiveFcfa: 5_000_000,
    dcCotationMaxExclusiveFcfa: 30_000_000,
    lettreCommandeMaxExclusiveFcfa: 50_000_000,
    marcheMinFcfa: 50_000_000,
    cccmThresholdFcfa: 100_000_000,
    cccmOrgan: 'CCCM_SPI',
  },
  PRESTATIONS_INTELLECTUELLES: {
    bcaMaxExclusiveFcfa: 5_000_000,
    dcCotationMaxExclusiveFcfa: null,
    lettreCommandeMaxExclusiveFcfa: 50_000_000,
    marcheMinFcfa: 50_000_000,
    cccmThresholdFcfa: 100_000_000,
    cccmOrgan: 'CCCM_SPI',
  },
};

export interface EntityCommissionRoutingRule {
  defaultCommission: CommissionType;
  requiresTutelleControl: boolean;
  supportsCccmFinancesFc: boolean;
  legalBasis: string;
}

export const ENTITY_COMMISSION_RULES: Record<EntityType, EntityCommissionRoutingRule> = {
  COMMUNE: {
    defaultCommission: 'CDPM',
    requiresTutelleControl: true,
    supportsCccmFinancesFc: false,
    legalBasis: 'CDPM (Commune) + Contrôle de légalité Préfet / CGCTD',
  },
  COMMUNAUTE_URBAINE: {
    defaultCommission: 'CIPM',
    requiresTutelleControl: true,
    supportsCccmFinancesFc: false,
    legalBasis: 'CIPM (Communauté Urbaine) + Tutelle Préfet / MINMAP',
  },
  REGION: {
    defaultCommission: 'CRPM',
    requiresTutelleControl: true,
    supportsCccmFinancesFc: false,
    legalBasis: 'CRPM (Conseil Régional) + Tutelle Gouverneur / CGCTD',
  },
  MINISTERE: {
    defaultCommission: 'CIPM',
    requiresTutelleControl: false,
    supportsCccmFinancesFc: true,
    legalBasis: 'CIPM Ministérielle + CCCM sectorielle compétente',
  },
  EPA: {
    defaultCommission: 'CIPM',
    requiresTutelleControl: false,
    supportsCccmFinancesFc: true,
    legalBasis: 'CIPM d’Établissement Public Administratif + CCCM compétente',
  },
  ENTREPRISE_PUBLIQUE: {
    defaultCommission: 'CIPM',
    requiresTutelleControl: false,
    supportsCccmFinancesFc: true,
    legalBasis: 'CIPM d’Entreprise Publique + CCCM-FC/sectorielle le cas échéant',
  },
  PROJET_PROGRAMME: {
    defaultCommission: 'CIPM',
    requiresTutelleControl: false,
    supportsCccmFinancesFc: false,
    legalBasis: 'CIPM / Commission Spéciale de Passation Projet',
  },
};

export interface ProcurementRoutingInput {
  entityType: EntityType;
  nature: ProcurementNature;
  estimatedAmountTtc: number;
  isInternational?: boolean;
  isRestricted?: boolean;
  isGreAGreRequested?: boolean;
  greAGreJustification?: 'URGENCE_IMPERIEUSE' | 'MONOPOLE_BREVET' | 'SECRET_DEFENSE' | 'CARENCE_REPRISE';
  isUrgent?: boolean;
  /** Pour les fournitures/services financiers ou opérations de régie financière relevant de CCCM-FC */
  isFinancialGovernanceScope?: boolean;
  customThresholds?: Partial<CmpThresholdsConfig>;
}

export interface ProcurementRoutingResult {
  contractType: ContractType;
  recommendedMode: ProcurementMode;
  primaryCommission: CommissionType | null;
  requiresCccmPriorOpinion: boolean;
  cccmOrgan: CommissionType | null;
  requiresMinmapPriorAuth: boolean;
  requiresTutelleLegalityControl: boolean;
  requiresBilingualAao: boolean;
  minPublicityDays: number;
  defaultPublicityDays: number;
  legalReferences: string[];
  warnings: string[];
}

function resolveLocalCommission(entityType: EntityType): CommissionType {
  return ENTITY_COMMISSION_RULES[entityType]?.defaultCommission ?? 'CIPM';
}

function resolveCccmOrgan(
  nature: ProcurementNature,
  entityType?: EntityType,
  isFinancialGovernanceScope?: boolean
): CommissionType {
  if (
    isFinancialGovernanceScope &&
    entityType &&
    ENTITY_COMMISSION_RULES[entityType]?.supportsCccmFinancesFc
  ) {
    return 'CCCM_FC';
  }
  return CMP_NATURE_THRESHOLDS[nature].cccmOrgan;
}

export function routeProcurementProcedure(
  input: ProcurementRoutingInput
): ProcurementRoutingResult {
  if (!Number.isFinite(input.estimatedAmountTtc) || input.estimatedAmountTtc <= 0) {
    throw new Error('Le montant prévisionnel TTC doit être strictement positif.');
  }

  const cfg: CmpThresholdsConfig = {
    ...DEFAULT_CMP_THRESHOLDS,
    ...input.customThresholds,
    cccmThresholdsFcfa: {
      ...DEFAULT_CMP_THRESHOLDS.cccmThresholdsFcfa,
      ...input.customThresholds?.cccmThresholdsFcfa,
    },
  };

  const amount = input.estimatedAmountTtc;
  const requiresTutelleLegalityControl =
    input.entityType === 'COMMUNE' ||
    input.entityType === 'COMMUNAUTE_URBAINE' ||
    input.entityType === 'REGION';

  const legalReferences: string[] = [
    'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
  ];
  if (requiresTutelleLegalityControl) {
    legalReferences.push('Loi n° 2019/024 du 24 décembre 2019 portant CGCTD');
  }

  const warnings: string[] = [];

  // 1. Cas Gré à Gré (Entente Directe)
  if (input.isGreAGreRequested) {
    if (!input.greAGreJustification) {
      throw new Error(
        'Le recours au Gré à Gré exige une justification légale précise (Urgence impérieuse, Monopole/Brevet, Secret défense ou Carence).'
      );
    }
    const contractType: ContractType =
      amount < cfg.bcaMaxExclusiveFcfa
        ? 'BON_COMMANDE_ADMINISTRATIF'
        : amount < cfg.lettreCommandeMaxExclusiveFcfa
          ? 'LETTRE_COMMANDE'
          : 'MARCHE';

    const cccmThreshold = cfg.cccmThresholdsFcfa[input.nature];
    const requiresCccm = amount >= cccmThreshold;

    legalReferences.push('CMP — Dispositions relatives aux marchés passés par entente directe (Gré à Gré)');

    return {
      contractType,
      recommendedMode: 'GRE_A_GRE',
      primaryCommission: amount >= cfg.bcaMaxExclusiveFcfa ? resolveLocalCommission(input.entityType) : null,
      requiresCccmPriorOpinion: requiresCccm,
      cccmOrgan: requiresCccm
        ? resolveCccmOrgan(input.nature, input.entityType, input.isFinancialGovernanceScope)
        : null,
      requiresMinmapPriorAuth: true,
      requiresTutelleLegalityControl,
      requiresBilingualAao: false,
      minPublicityDays: 0,
      defaultPublicityDays: 0,
      legalReferences,
      warnings: [
        'Autorisation préalable spéciale de l’Autorité chargée des Marchés Publics (MINMAP) obligatoire avant engagement.',
      ],
    };
  }

  // 2. En dessous de 5 000 000 FCFA TTC : Bon de Commande Administratif
  if (amount < cfg.bcaMaxExclusiveFcfa) {
    return {
      contractType: 'BON_COMMANDE_ADMINISTRATIF',
      recommendedMode: 'DC_COTATION',
      primaryCommission: null,
      requiresCccmPriorOpinion: false,
      cccmOrgan: null,
      requiresMinmapPriorAuth: false,
      requiresTutelleLegalityControl,
      requiresBilingualAao: false,
      minPublicityDays: 5,
      defaultPublicityDays: 7,
      legalReferences,
      warnings: [
        'Montant inférieur au seuil de 5 000 000 FCFA TTC : consultation d’au moins trois (03) prestataires recommandée pour la traçabilité.',
      ],
    };
  }

  // 3. Entre 5M et < 50M FCFA TTC : Lettre-Commande
  const primaryCommission = resolveLocalCommission(input.entityType);
  legalReferences.push('Décret n° 2013/271 du 05 août 2013 (Commissions de Passation des Marchés)');

  if (amount < cfg.lettreCommandeMaxExclusiveFcfa) {
    let recommendedMode: ProcurementMode = 'AONO';
    let minPublicityDays = input.isUrgent ? 15 : 21;
    let defaultPublicityDays = 21;

    if (input.nature === 'PRESTATIONS_INTELLECTUELLES') {
      recommendedMode = 'ASMI';
      minPublicityDays = 15;
      defaultPublicityDays = 21;
    } else if (
      (input.nature === 'FOURNITURES' || input.nature === 'SERVICES_QUANTIFIABLES') &&
      amount < cfg.dcCotationMaxExclusiveFcfa
    ) {
      recommendedMode = 'DC_COTATION';
      minPublicityDays = 10;
      defaultPublicityDays = 15;
    } else if (input.isRestricted) {
      recommendedMode = 'AONR';
    }

    return {
      contractType: 'LETTRE_COMMANDE',
      recommendedMode,
      primaryCommission,
      requiresCccmPriorOpinion: false,
      cccmOrgan: null,
      requiresMinmapPriorAuth: false,
      requiresTutelleLegalityControl,
      requiresBilingualAao: recommendedMode !== 'DC_COTATION',
      minPublicityDays,
      defaultPublicityDays,
      legalReferences,
      warnings,
    };
  }

  // 4. >= 50 000 000 FCFA TTC : Marché Public
  let recommendedMode: ProcurementMode;
  let minPublicityDays: number;
  let defaultPublicityDays: number;

  if (input.nature === 'PRESTATIONS_INTELLECTUELLES') {
    recommendedMode = 'ASMI';
    minPublicityDays = 15;
    defaultPublicityDays = 21;
  } else if (input.isInternational) {
    recommendedMode = input.isRestricted ? 'AOIR' : 'AOIO';
    minPublicityDays = input.isUrgent ? 30 : 45;
    defaultPublicityDays = 45;
  } else {
    recommendedMode = input.isRestricted ? 'AONR' : 'AONO';
    minPublicityDays = input.isUrgent ? 21 : 25;
    defaultPublicityDays = 30;
  }

  const cccmThreshold = cfg.cccmThresholdsFcfa[input.nature];
  const requiresCccm = amount >= cccmThreshold;
  const cccmOrgan = requiresCccm
    ? resolveCccmOrgan(input.nature, input.entityType, input.isFinancialGovernanceScope)
    : null;

  if (requiresCccm) {
    warnings.push(
      `Seuil CCCM atteint (>= ${cccmThreshold.toLocaleString('fr-FR')} FCFA TTC) : avis conforme obligatoire de la ${cccmOrgan}.`
    );
  }

  return {
    contractType: 'MARCHE',
    recommendedMode,
    primaryCommission,
    requiresCccmPriorOpinion: requiresCccm,
    cccmOrgan,
    requiresMinmapPriorAuth: false,
    requiresTutelleLegalityControl,
    requiresBilingualAao: true,
    minPublicityDays,
    defaultPublicityDays,
    legalReferences,
    warnings,
  };
}

// ============================================================================
// RETROPLANNING LEGAL & CALCUL DE PROROGATION / STANDSTILL
// ============================================================================

export const CAMEROON_FIXED_HOLIDAYS_MM_DD = new Set<string>([
  '01-01', // Nouvel An
  '02-11', // Fête de la Jeunesse
  '05-01', // Fête du Travail
  '05-20', // Fête Nationale
  '08-15', // Assomption
  '12-25', // Noël
]);

export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isBusinessDayCameroon(
  date: Date,
  extraHolidaysIso: Set<string> = new Set()
): boolean {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false; // Dimanche / Samedi
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  if (CAMEROON_FIXED_HOLIDAYS_MM_DD.has(`${mm}-${dd}`)) return false;
  if (extraHolidaysIso.has(`${yyyy}-${mm}-${dd}`)) return false;
  return true;
}

export function addBusinessDaysCameroon(
  startDate: Date,
  businessDays: number,
  extraHolidaysIso: Set<string> = new Set()
): Date {
  const current = new Date(startDate.getTime());
  let remaining = businessDays;
  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (isBusinessDayCameroon(current, extraHolidaysIso)) {
      remaining -= 1;
    }
  }
  return current;
}

export interface LegalTimelineInput {
  publicationDate: Date;
  mode: ProcurementMode;
  publicityDays?: number;
  isUrgent?: boolean;
  extraHolidaysIso?: string[];
  config?: Partial<CmpThresholdsConfig>;
}

export interface LegalTimelineResult {
  publicationDate: Date;
  minSubmissionDeadline: Date;
  openingDate: Date;
  offerValidityEndDate: Date;
  estimatedAwardPublicationDate: Date;
  standstillEndDate: Date;
}

export function calculateLegalTimeline(input: LegalTimelineInput): LegalTimelineResult {
  const cfg = { ...DEFAULT_CMP_THRESHOLDS, ...input.config };
  const holidays = new Set(input.extraHolidaysIso ?? []);

  let defaultDays = 25;
  if (input.mode === 'AOIO' || input.mode === 'AOIR') {
    defaultDays = input.isUrgent ? 30 : 45;
  } else if (input.mode === 'DC_COTATION') {
    defaultDays = 15;
  } else if (input.mode === 'ASMI') {
    defaultDays = 21;
  } else if (input.mode === 'GRE_A_GRE' || input.mode === 'REGIE') {
    defaultDays = 0;
  } else {
    defaultDays = input.isUrgent ? 21 : 25;
  }

  const pubDays = input.publicityDays ?? defaultDays;
  const minSubmissionDeadline = addCalendarDays(input.publicationDate, pubDays);
  const openingDate = new Date(minSubmissionDeadline.getTime());
  const offerValidityEndDate = addCalendarDays(openingDate, cfg.offerValidityDays);
  // Estimation indicative d'attribution après analyse SCA + adoption CPM (~15 jours)
  const estimatedAwardPublicationDate = addCalendarDays(openingDate, 15);
  const standstillEndDate = addBusinessDaysCameroon(
    estimatedAwardPublicationDate,
    cfg.standstillBusinessDays,
    holidays
  );

  return {
    publicationDate: new Date(input.publicationDate.getTime()),
    minSubmissionDeadline,
    openingDate,
    offerValidityEndDate,
    estimatedAwardPublicationDate,
    standstillEndDate,
  };
}

export interface AddendumExtensionInput {
  currentSubmissionDeadline: Date;
  addendumIssuedAt: Date;
  modifiesSubstantially: boolean;
  minNoticeDays?: number;
}

export interface AddendumExtensionResult {
  extensionRequired: boolean;
  reason: string | null;
  newSubmissionDeadline: Date;
  newOpeningDate: Date;
  addedDays: number;
}

export function evaluateAddendumExtension(
  input: AddendumExtensionInput
): AddendumExtensionResult {
  const minDays = input.minNoticeDays ?? DEFAULT_CMP_THRESHOLDS.addendumMinNoticeDays;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDeadline =
    (input.currentSubmissionDeadline.getTime() - input.addendumIssuedAt.getTime()) / msPerDay;

  if (daysUntilDeadline < 0) {
    throw new Error('Impossible d’émettre un additif après la date limite de dépôt des offres.');
  }

  const minRequiredDeadline = addCalendarDays(input.addendumIssuedAt, minDays);
  const mustExtend = input.modifiesSubstantially || daysUntilDeadline < minDays;

  if (!mustExtend || input.currentSubmissionDeadline >= minRequiredDeadline) {
    return {
      extensionRequired: false,
      reason: null,
      newSubmissionDeadline: new Date(input.currentSubmissionDeadline.getTime()),
      newOpeningDate: new Date(input.currentSubmissionDeadline.getTime()),
      addedDays: 0,
    };
  }

  const addedDays = Math.ceil(
    (minRequiredDeadline.getTime() - input.currentSubmissionDeadline.getTime()) / msPerDay
  );

  const reason = input.modifiesSubstantially
    ? `Additif modifiant substantiellement les spécifications du DAO : report minimal de ${minDays} jours imposé.`
    : `Additif émis à ${daysUntilDeadline.toFixed(1)} jour(s) (< ${minDays} jours) avant l'ouverture : prorogation réglementaire automatique.`;

  return {
    extensionRequired: true,
    reason,
    newSubmissionDeadline: minRequiredDeadline,
    newOpeningDate: new Date(minRequiredDeadline.getTime()),
    addedDays,
  };
}
