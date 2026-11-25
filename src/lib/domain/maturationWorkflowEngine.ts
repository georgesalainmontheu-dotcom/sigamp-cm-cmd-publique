import type {
  CommissionType,
  ContractType,
  EntityType,
  ProcurementMode,
  ProcurementNature,
} from '../../types/domain';
import type { MaturationItemRecord } from './exceptionsEngine';
import { routeProcurementProcedure } from './procurementRouter';

/**
 * Moteur d'Orchestration Maturation -> Démarche Procédurale -> Suivi du Statut des Livrables.
 * Conforme au Décret n° 2018/366 (CMP), Circulaire n° 001/CAB/PM et Décret n° 2013/271.
 */

export type FundingCategory =
  | 'BUDGET_PROPRE'
  | 'BIP_ETAT'
  | 'FEICOM'
  | 'BAILLEUR_EXTERNE';

export type ProcedureUrgencyMode =
  | 'NORMALE'
  | 'URGENCE_IMPERIEUSE'
  | 'INFRUCTUEUX_ANTERIEUR';

export type DeliverableStatus =
  | 'A_PRODUIRE'
  | 'EN_REDACTION'
  | 'SOUMIS_CONTROLE'
  | 'VISA_OBTENU'
  | 'SIGNE_ARCHIVE_GED'
  | 'REJETE_A_CORRIGER';

export interface MaturationProcedureInput {
  projectCode: string;
  projectTitle: string;
  entityType: EntityType;
  nature: ProcurementNature;
  estimatedAmountTtc: number;
  fundingCategory: FundingCategory;
  urgencyMode: ProcedureUrgencyMode;
  requiresLandSite: boolean;
  requiresEnvironmentalNotice: boolean;
  allotted: boolean;
}

export interface ProcedureDeliverableItem {
  id: string;
  phase: 1 | 2 | 3 | 4 | 5;
  phaseLabel: string;
  stepNumber: number;
  stepTitle: string;
  deliverableTitle: string;
  deliverableCode: string;
  responsibleRole: string;
  targetDays: number;
  blocking: boolean;
  status: DeliverableStatus;
  documentRef?: string;
  updatedAtIso?: string;
  rejectionComment?: string;
}

export interface MaturationRoadmapResult {
  recommendedMode: ProcurementMode;
  contractType: ContractType;
  commissionOrgan: CommissionType | null;
  requiresCccm: boolean;
  cccmOrgan: CommissionType | null;
  requiresTutelleVisa: boolean;
  estimatedTotalDurationDays: number;
  legalBasisSummary: string;
  adaptedMaturationPieces: MaturationItemRecord[];
  deliverables: ProcedureDeliverableItem[];
}

export interface DeliverablesTrackingMetrics {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  rejectedCount: number;
  blockingPendingCount: number;
  progressPercent: number;
  canLaunchConsultation: boolean;
}

const PHASE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Phase 1 · Maturation & Disponibilité Crédits',
  2: 'Phase 2 · Montage Technique & Dossier',
  3: 'Phase 3 · Passation, Ouverture & Analyse',
  4: 'Phase 4 · Attribution, Visas & Contractualisation',
  5: 'Phase 5 · Exécution, Décomptes & Réceptions',
};

export function generateAdaptedMaturationChecklist(
  input: MaturationProcedureInput
): MaturationItemRecord[] {
  const isWorks = input.nature === 'TRAVAUX';
  const isIntellectual = input.nature === 'PRESTATIONS_INTELLECTUELLES';
  const isHighValue = input.estimatedAmountTtc >= 50_000_000;
  const isMicroBca = input.estimatedAmountTtc < 5_000_000;

  const items: MaturationItemRecord[] = [
    {
      pieceType: 'MERCURIALE_ESTIMATION',
      label: isMicroBca
        ? 'Proforma / Estimation adossée à la Mercuriale MINCOMMERCE & disponibilité crédits'
        : 'Devis estimatif confidentiel (Mercuriale MINCOMMERCE) & disponibilité crédits',
      mandatory: true,
      status: 'EN_COURS',
    },
  ];

  if (isIntellectual || !isWorks) {
    items.push({
      pieceType: 'TDR',
      label: isIntellectual
        ? 'Termes de Référence (TDR) détaillés & profil des experts'
        : 'Descriptif technique / Bordereau des spécifications',
      mandatory: true,
      status: 'EN_COURS',
    });
  }

  if (isWorks && !isMicroBca) {
    items.push({
      pieceType: 'APS_APD',
      label: isHighValue
        ? 'Études Techniques APS / APD visées par l’Ingénieur de l’État'
        : 'Devis technique sommaire & plans d’exécution validés',
      mandatory: true,
      status: 'EN_COURS',
    });
  }

  if (isWorks && (input.requiresLandSite || isHighValue)) {
    items.push({
      pieceType: 'DISPONIBILITE_SITE',
      label: 'Acte de disponibilité du site / Emprise foncière libre de toute contrainte',
      mandatory: true,
      status: 'EN_COURS',
    });
  }

  if ((isWorks && isHighValue) || input.requiresEnvironmentalNotice) {
    items.push({
      pieceType: 'EIES_NOTICE',
      label: 'Notice / Certificat d’Impact Environnemental (MINEPDED)',
      mandatory: true,
      status: 'EN_COURS',
    });
  }

  return items;
}

export function buildMaturationProcedurePlan(
  input: MaturationProcedureInput
): MaturationRoadmapResult {
  const safeAmount = Math.max(100_000, input.estimatedAmountTtc);
  const routing = routeProcurementProcedure({
    entityType: input.entityType,
    nature: input.nature,
    estimatedAmountTtc: safeAmount,
  });

  let effectiveMode: ProcurementMode = routing.recommendedMode;
  let extraLegalNote =
    routing.legalReferences.join(' · ') ||
    'Décret N° 2018/366 du 20 juin 2018 portant Code des Marchés Publics';

  if (input.urgencyMode === 'URGENCE_IMPERIEUSE') {
    effectiveMode = 'GRE_A_GRE';
    extraLegalNote =
      'Procédure de Gré à Gré pour urgence impérieuse (Art. 109 CMP) — Autorisation préalable du MINMAP requise.';
  } else if (
    input.urgencyMode === 'INFRUCTUEUX_ANTERIEUR' &&
    routing.recommendedMode === 'AONO'
  ) {
    effectiveMode = 'AONR';
    extraLegalNote =
      'Appel d’Offres National Restreint après appel d’offres ouvert déclaré infructueux (Art. 77 CMP).';
  }

  const isBca = routing.contractType === 'BON_COMMANDE_ADMINISTRATIF';

  const adaptedMaturationPieces = generateAdaptedMaturationChecklist(input);
  const deliverables: ProcedureDeliverableItem[] = [];
  let stepCounter = 1;

  const pushDeliverable = (params: {
    phase: 1 | 2 | 3 | 4 | 5;
    stepTitle: string;
    deliverableTitle: string;
    deliverableCode: string;
    responsibleRole: string;
    targetDays: number;
    blocking: boolean;
  }) => {
    deliverables.push({
      id: `deliv-${input.projectCode || 'PRJ'}-${stepCounter}`,
      phase: params.phase,
      phaseLabel: PHASE_LABELS[params.phase],
      stepNumber: stepCounter,
      stepTitle: params.stepTitle,
      deliverableTitle: params.deliverableTitle,
      deliverableCode: params.deliverableCode,
      responsibleRole: params.responsibleRole,
      targetDays: params.targetDays,
      blocking: params.blocking,
      status: 'A_PRODUIRE',
    });
    stepCounter += 1;
  };

  // --- PHASE 1 : MATURATION ---
  pushDeliverable({
    phase: 1,
    stepTitle: 'Cadrage budgétaire & programmation PPM',
    deliverableTitle:
      input.fundingCategory === 'FEICOM'
        ? 'Fiche PPM & Convention de financement FEICOM'
        : 'Attestation de Disponibilité des Crédits & Fiche PPM',
    deliverableCode: 'ACT-MAT-CREDITS',
    responsibleRole: 'MO_MOD',
    targetDays: 3,
    blocking: true,
  });

  if (input.nature === 'TRAVAUX' && safeAmount >= 5_000_000) {
    pushDeliverable({
      phase: 1,
      stepTitle: 'Études techniques préalables & emprise',
      deliverableTitle:
        safeAmount >= 50_000_000
          ? 'Dossier APS/APD validé + Attestation de disponibilité du site'
          : 'Plans sommaires & Attestation de disponibilité du site',
      deliverableCode: 'ACT-MAT-APD',
      responsibleRole: 'INGENIEUR_MARCHE',
      targetDays: safeAmount >= 50_000_000 ? 15 : 5,
      blocking: true,
    });
  } else {
    pushDeliverable({
      phase: 1,
      stepTitle: 'Expression technique du besoin',
      deliverableTitle:
        input.nature === 'PRESTATIONS_INTELLECTUELLES'
          ? 'Termes de Référence (TDR) validés'
          : 'Descriptif technique & Spécifications',
      deliverableCode: 'ACT-MAT-TDR',
      responsibleRole: 'SIGAMP',
      targetDays: 4,
      blocking: true,
    });
  }

  if (
    (input.nature === 'TRAVAUX' && safeAmount >= 50_000_000) ||
    input.requiresEnvironmentalNotice
  ) {
    pushDeliverable({
      phase: 1,
      stepTitle: 'Conformité environnementale MINEPDED',
      deliverableTitle: 'Notice d’Impact Environnemental et Social (EIES)',
      deliverableCode: 'ACT-MAT-EIES',
      responsibleRole: 'INGENIEUR_MARCHE',
      targetDays: 10,
      blocking: true,
    });
  }

  if (effectiveMode === 'GRE_A_GRE') {
    pushDeliverable({
      phase: 1,
      stepTitle: 'Autorisation dérogatoire MINMAP (Art. 109)',
      deliverableTitle: 'Accord préalable du MINMAP pour Gré à Gré',
      deliverableCode: 'ACT-MINMAP-GAG',
      responsibleRole: 'MO_MOD',
      targetDays: 7,
      blocking: true,
    });
  }

  // --- PHASE 2 : MONTAGE TECHNIQUE & DOSSIER ---
  if (isBca) {
    pushDeliverable({
      phase: 2,
      stepTitle: 'Collecte des factures proforma',
      deliverableTitle: 'Tableau comparatif de 3 proformas & Vérification Mercuriale',
      deliverableCode: 'ACT-BCA-PROFORMA',
      responsibleRole: 'SIGAMP',
      targetDays: 3,
      blocking: true,
    });
  } else {
    pushDeliverable({
      phase: 2,
      stepTitle: 'Désignation Ingénieur & Devis Confidentiel',
      deliverableTitle: 'Lettre de Saisine Ingénieur, CCTP & Devis Confidentiel scellé',
      deliverableCode: 'ACT-TECH-CCTP-DEVIS',
      responsibleRole: 'INGENIEUR_MARCHE',
      targetDays: 5,
      blocking: true,
    });

    pushDeliverable({
      phase: 2,
      stepTitle:
        effectiveMode === 'DC_COTATION'
          ? 'Montage du Dossier de Demande de Cotation (DC)'
          : 'Assemblage du DAO (80% Standard / 20% Adapté)' +
            (input.allotted ? ' — Allotissement' : ''),
      deliverableTitle:
        effectiveMode === 'DC_COTATION'
          ? 'Dossier de Demande de Cotation prêt pour consultation'
          : 'Projet de DAO complet (AAO, RPAO, CCAP, CCTP, BPU/DQE)',
      deliverableCode: effectiveMode === 'DC_COTATION' ? 'ACT-DC-COTATION' : 'ACT-DAO-AONO',
      responsibleRole: 'SIGAMP',
      targetDays: 5,
      blocking: true,
    });

    if (routing.primaryCommission) {
      pushDeliverable({
        phase: 2,
        stepTitle: `Examen & Avis de la ${routing.primaryCommission}`,
        deliverableTitle: `Procès-Verbal de validation du dossier par la ${routing.primaryCommission}`,
        deliverableCode: 'ACT-PV-EXAM-DAO',
        responsibleRole: 'CPM_PRESIDENT',
        targetDays: 7,
        blocking: true,
      });
    }
  }

  // --- PHASE 3 : PASSATION, OUVERTURE & ANALYSE ---
  if (isBca) {
    pushDeliverable({
      phase: 3,
      stepTitle: 'Engagement & Visa Contrôle Financier',
      deliverableTitle: 'Bon de Commande Administratif (BCA) visé par le CF',
      deliverableCode: 'ACT-BCA-VISE',
      responsibleRole: 'CONTROLEUR_FINANCIER',
      targetDays: 3,
      blocking: true,
    });
  } else {
    const pubDays =
      effectiveMode === 'DC_COTATION'
        ? 10
        : safeAmount >= 50_000_000
          ? 30
          : 21;
    pushDeliverable({
      phase: 3,
      stepTitle:
        effectiveMode === 'DC_COTATION'
          ? 'Consultation d’au moins 3 prestataires'
          : 'Publication AAO au JMP (ARMP) & Portail /avis',
      deliverableTitle:
        effectiveMode === 'DC_COTATION'
          ? 'Lettres d’invitation DC & Accusés de réception (≥ 3)'
          : 'Avis d’Appel d’Offres publié & Registre de retrait DAO',
      deliverableCode: 'ACT-PUB-AAO',
      responsibleRole: 'SIGAMP',
      targetDays: pubDays,
      blocking: true,
    });

    pushDeliverable({
      phase: 3,
      stepTitle: 'Ouverture des plis & Évaluation SCA',
      deliverableTitle: 'PV d’Ouverture + Rapport d’Analyse SCA + Contrôle OAB',
      deliverableCode: 'ACT-PV-SCA',
      responsibleRole: 'SCA_RAPPORTEUR',
      targetDays: 7,
      blocking: true,
    });

    if (routing.requiresCccmPriorOpinion && routing.cccmOrgan) {
      pushDeliverable({
        phase: 3,
        stepTitle: `Avis conforme de la ${routing.cccmOrgan}`,
        deliverableTitle: `Avis technique conforme ${routing.cccmOrgan} (seuil dépassé)`,
        deliverableCode: 'ACT-AVIS-CCCM',
        responsibleRole: 'CPM_PRESIDENT',
        targetDays: 10,
        blocking: true,
      });
    }
  }

  // --- PHASE 4 : ATTRIBUTION, VISAS & CONTRACTUALISATION ---
  if (!isBca) {
    pushDeliverable({
      phase: 4,
      stepTitle: 'Décision d’attribution & Standstill (5 jours ouvrables)',
      deliverableTitle: 'Décision d’Attribution publiée + Certificat de non-recours',
      deliverableCode: 'ACT-DEC-ATTRIB',
      responsibleRole: 'MO_MOD',
      targetDays: 7,
      blocking: true,
    });

    pushDeliverable({
      phase: 4,
      stepTitle: 'Signature Contrat & Visas réglementaires',
      deliverableTitle:
        `${routing.contractType === 'MARCHE' ? 'Marché Public' : 'Lettre-Commande'} signé + Visa CF` +
        (routing.requiresTutelleLegalityControl ? ' + Approbation Tutelle' : ''),
      deliverableCode: 'ACT-CONTRAT-SIGNE',
      responsibleRole: routing.requiresTutelleLegalityControl
        ? 'TUTELLE_ETAT'
        : 'CONTROLEUR_FINANCIER',
      targetDays: 10,
      blocking: true,
    });
  }

  // --- PHASE 5 : EXÉCUTION & RÉCEPTIONS ---
  pushDeliverable({
    phase: 5,
    stepTitle: 'Notification & Ordre de Service de démarrage',
    deliverableTitle: 'Ordre de Service N° 001 de démarrage des prestations',
    deliverableCode: 'ACT-OS-DEMARRAGE',
    responsibleRole: 'MO_MOD',
    targetDays: 3,
    blocking: false,
  });

  pushDeliverable({
    phase: 5,
    stepTitle: 'Suivi exécution, décomptes & PV de réception',
    deliverableTitle: 'Décomptes liquidés & PV de Réception Provisoire / Définitive',
    deliverableCode: 'ACT-PV-RECEP-PROV',
    responsibleRole: 'INGENIEUR_MARCHE',
    targetDays: 14,
    blocking: false,
  });

  const estimatedTotalDurationDays = deliverables.reduce(
    (sum, d) => sum + d.targetDays,
    0
  );

  return {
    recommendedMode: effectiveMode,
    contractType: routing.contractType,
    commissionOrgan: routing.primaryCommission,
    requiresCccm: routing.requiresCccmPriorOpinion,
    cccmOrgan: routing.cccmOrgan,
    requiresTutelleVisa: routing.requiresTutelleLegalityControl,
    estimatedTotalDurationDays,
    legalBasisSummary: extraLegalNote,
    adaptedMaturationPieces,
    deliverables,
  };
}

export function computeDeliverablesMetrics(
  deliverables: ProcedureDeliverableItem[]
): DeliverablesTrackingMetrics {
  const totalCount = deliverables.length;
  const completedCount = deliverables.filter(
    (d) => d.status === 'VISA_OBTENU' || d.status === 'SIGNE_ARCHIVE_GED'
  ).length;
  const inProgressCount = deliverables.filter(
    (d) => d.status === 'EN_REDACTION' || d.status === 'SOUMIS_CONTROLE'
  ).length;
  const rejectedCount = deliverables.filter(
    (d) => d.status === 'REJETE_A_CORRIGER'
  ).length;

  const blockingPendingCount = deliverables.filter(
    (d) =>
      (d.phase === 1 || d.phase === 2) &&
      d.blocking &&
      d.status !== 'VISA_OBTENU' &&
      d.status !== 'SIGNE_ARCHIVE_GED'
  ).length;

  const progressPercent =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return {
    totalCount,
    completedCount,
    inProgressCount,
    rejectedCount,
    blockingPendingCount,
    progressPercent,
    canLaunchConsultation: blockingPendingCount === 0 && totalCount > 0,
  };
}

export function updateDeliverableStatus(
  deliverables: ProcedureDeliverableItem[],
  deliverableId: string,
  patch: {
    status?: DeliverableStatus;
    documentRef?: string;
    rejectionComment?: string;
  }
): ProcedureDeliverableItem[] {
  const nowIso = new Date().toISOString();
  return deliverables.map((d) => {
    if (d.id !== deliverableId) return d;
    return {
      ...d,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.documentRef !== undefined ? { documentRef: patch.documentRef } : {}),
      ...(patch.rejectionComment !== undefined
        ? { rejectionComment: patch.rejectionComment }
        : {}),
      updatedAtIso: nowIso,
    };
  });
}
