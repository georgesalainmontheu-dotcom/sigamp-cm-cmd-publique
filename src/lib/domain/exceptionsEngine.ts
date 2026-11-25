import { CAMEROON_TAX_DEFAULTS, roundFcfa } from './billingEngine';
import { addCalendarDays } from './procurementRouter';

/**
 * Moteur 4 : Moteur des Cas Spéciaux & Verrous Juridiques
 * - Verrou du plafond légal des 30% sur les avenants (CMP)
 * - Chronomètre réglementaire de Mise en Demeure (15 à 21 jours)
 * - Liquidation en cas de résiliation aux torts exclusifs & saisine ARMP.
 */

export const AMENDMENT_LEGAL_CAP_PCT = 30.0;
export const MISE_EN_DEMEURE_MIN_DAYS = 15;
export const MISE_EN_DEMEURE_MAX_DAYS = 21;

export interface AmendmentEvaluationInput {
  initialContractAmountHt: number;
  previousApprovedAmendmentsDeltaHt: number;
  proposedAmendmentDeltaHt: number;
  hasCpmOrCccmOpinion: boolean;
  cpmOrCccmOpinionRef?: string;
  hasBudgetaryCommitment: boolean;
  minmapDerogationRef?: string;
}

export interface AmendmentEvaluationResult {
  previousCumulativeDeltaHt: number;
  newCumulativeDeltaHt: number;
  cumulativePercentage: number;
  exceeds30PercentCap: boolean;
  requiresMinmapDerogation: boolean;
  canValidateStandard: boolean;
  canSignOrExecute: boolean;
  blockingReasons: string[];
  requiredWorkflowRoute: 'STANDARD_CPM_CF' | 'DEROGATION_EXCEPTIONNELLE_ACMP_MINMAP';
}

export function evaluateAmendment(
  input: AmendmentEvaluationInput
): AmendmentEvaluationResult {
  if (input.initialContractAmountHt <= 0) {
    throw new Error('Le montant initial HT du marché doit être strictement positif.');
  }

  const newCumulativeDeltaHt =
    input.previousApprovedAmendmentsDeltaHt + input.proposedAmendmentDeltaHt;
  const cumulativePercentage = Number(
    ((newCumulativeDeltaHt / input.initialContractAmountHt) * 100).toFixed(4)
  );
  const exceeds30PercentCap = cumulativePercentage > AMENDMENT_LEGAL_CAP_PCT;
  const requiresMinmapDerogation = exceeds30PercentCap;

  const blockingReasons: string[] = [];

  if (!input.hasCpmOrCccmOpinion || !input.cpmOrCccmOpinionRef?.trim()) {
    blockingReasons.push(
      'Avis préalable obligatoire de la Commission de Passation (CPM) ou de la CCCM manquant.'
    );
  }
  if (!input.hasBudgetaryCommitment) {
    blockingReasons.push(
      'Engagement budgétaire complémentaire (Visa Contrôleur Financier) requis avant signature.'
    );
  }
  if (requiresMinmapDerogation && !input.minmapDerogationRef?.trim()) {
    blockingReasons.push(
      `Plafond légal de 30% dépassé (${cumulativePercentage}%) : dérogation expresse de l’ACMP (MINMAP) obligatoire.`
    );
  }

  return {
    previousCumulativeDeltaHt: roundFcfa(input.previousApprovedAmendmentsDeltaHt),
    newCumulativeDeltaHt: roundFcfa(newCumulativeDeltaHt),
    cumulativePercentage,
    exceeds30PercentCap,
    requiresMinmapDerogation,
    canValidateStandard: !exceeds30PercentCap,
    canSignOrExecute: blockingReasons.length === 0,
    blockingReasons,
    requiredWorkflowRoute: exceeds30PercentCap
      ? 'DEROGATION_EXCEPTIONNELLE_ACMP_MINMAP'
      : 'STANDARD_CPM_CF',
  };
}

// ============================================================================
// MISE EN DEMEURE (15 A 21 JOURS) & RESILIATION AUX TORTS EXCLUSIFS
// ============================================================================

export interface MiseEnDemeureInput {
  notifiedAt: Date;
  gracePeriodDays: number; // Doit être compris entre 15 et 21 jours selon le CCAP
  evaluationDate: Date;
  remediedBySupplier: boolean;
}

export interface MiseEnDemeureStatus {
  notifiedAt: Date;
  gracePeriodDays: number;
  deadlineDate: Date;
  daysRemaining: number;
  isExpired: boolean;
  eligibleForFaultTermination: boolean;
}

export function evaluateMiseEnDemeure(
  input: MiseEnDemeureInput
): MiseEnDemeureStatus {
  if (
    input.gracePeriodDays < MISE_EN_DEMEURE_MIN_DAYS ||
    input.gracePeriodDays > MISE_EN_DEMEURE_MAX_DAYS
  ) {
    throw new Error(
      `Délai de mise en demeure non conforme : doit être compris entre ${MISE_EN_DEMEURE_MIN_DAYS} et ${MISE_EN_DEMEURE_MAX_DAYS} jours calendaires.`
    );
  }

  const deadlineDate = addCalendarDays(input.notifiedAt, input.gracePeriodDays);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil(
    (deadlineDate.getTime() - input.evaluationDate.getTime()) / msPerDay
  );
  const daysRemaining = Math.max(0, diffDays);
  const isExpired = input.evaluationDate.getTime() > deadlineDate.getTime();

  return {
    notifiedAt: new Date(input.notifiedAt.getTime()),
    gracePeriodDays: input.gracePeriodDays,
    deadlineDate,
    daysRemaining,
    isExpired,
    eligibleForFaultTermination: isExpired && !input.remediedBySupplier,
  };
}

export interface FaultTerminationLiquidationInput {
  contractInitialAmountTtc: number;
  executedAndAcceptedTtc: number;
  alreadyPaidToSupplierTtc: number;
  unamortizedStartAdvanceFcfa: number;
  accruedDelayPenaltiesFcfa: number;
  performanceBondAmountFcfa: number;
  substitutionExtraCostFcfa?: number;
  miseEnDemeureStatus: MiseEnDemeureStatus;
}

export interface FaultTerminationLiquidationResult {
  canProceedWithTermination: boolean;
  cappedDelayPenaltiesFcfa: number;
  confiscatedPerformanceBondFcfa: number;
  totalSupplierCreditsFcfa: number;
  totalAdministrationClaimsFcfa: number;
  netBalanceDueToSupplierFcfa: number;
  netDebtOwedBySupplierFcfa: number;
  requiresArmpSanctionReferral: boolean;
  armpSanctionChecklist: string[];
}

export function calculateFaultTerminationLiquidation(
  input: FaultTerminationLiquidationInput
): FaultTerminationLiquidationResult {
  if (!input.miseEnDemeureStatus.eligibleForFaultTermination) {
    throw new Error(
      'Résiliation pour faute bloquée : la mise en demeure préalable (15 à 21 jours) n’est pas encore expirée ou a été régularisée.'
    );
  }

  const maxPenaltyCap = roundFcfa(
    input.contractInitialAmountTtc * CAMEROON_TAX_DEFAULTS.MAX_PENALTY_CAP_RATE
  );
  const cappedDelayPenaltiesFcfa = Math.min(
    roundFcfa(input.accruedDelayPenaltiesFcfa),
    maxPenaltyCap
  );

  const confiscatedPerformanceBondFcfa = roundFcfa(input.performanceBondAmountFcfa);
  const substitutionExtraCost = roundFcfa(input.substitutionExtraCostFcfa ?? 0);

  // Créances constatées du titulaire (travaux acceptés - déjà payé) + saisie de la caution en couverture
  const netWorkBalance =
    roundFcfa(input.executedAndAcceptedTtc) - roundFcfa(input.alreadyPaidToSupplierTtc);

  const totalSupplierCreditsFcfa = Math.max(0, netWorkBalance);
  const administrationGrossClaims =
    roundFcfa(input.unamortizedStartAdvanceFcfa) +
    cappedDelayPenaltiesFcfa +
    substitutionExtraCost +
    (netWorkBalance < 0 ? Math.abs(netWorkBalance) : 0);

  // Imputation de la caution de bonne exécution confisquée sur la dette du titulaire défaillant
  const netClaimAfterBond =
    administrationGrossClaims - totalSupplierCreditsFcfa - confiscatedPerformanceBondFcfa;

  const netBalanceDueToSupplierFcfa =
    netClaimAfterBond < 0
      ? Math.max(0, totalSupplierCreditsFcfa - administrationGrossClaims)
      : 0;
  const netDebtOwedBySupplierFcfa = Math.max(0, netClaimAfterBond);

  return {
    canProceedWithTermination: true,
    cappedDelayPenaltiesFcfa,
    confiscatedPerformanceBondFcfa,
    totalSupplierCreditsFcfa,
    totalAdministrationClaimsFcfa: administrationGrossClaims,
    netBalanceDueToSupplierFcfa,
    netDebtOwedBySupplierFcfa,
    requiresArmpSanctionReferral: true,
    armpSanctionChecklist: [
      'Copie de l’Ordre de Service de Mise en Demeure et preuve de notification',
      'PV de constat de carence établi à l’expiration du délai de grâce',
      'Décision motivée de résiliation aux torts exclusifs signée par le Maître d’Ouvrage',
      'État liquidatif contradictoire et demande d’exclusion temporaire/définitive adressée à l’ARMP (Circulaire 00000001/PR/MINMAP/CAB)',
    ],
  };
}

// ============================================================================
// SURVEILLANCE D'EXPIRATION DES CAUTIONS OHADA & ASSURANCES CHANTIER
// ============================================================================

export type SecurityInstrumentType =
  | 'CAUTION_SOUMISSION'
  | 'CAUTION_BONNE_EXECUTION'
  | 'CAUTION_AVANCE_DEMARRAGE'
  | 'CAUTION_RETENUE_GARANTIE'
  | 'ASSURANCE_TRC_RC';

export interface SecurityRecordInput {
  id: string;
  contractOrBidRef: string;
  supplierName: string;
  securityType: SecurityInstrumentType;
  issuerInstitution: string;
  referenceNumber: string;
  amountFcfa: number;
  expiryDateIso: string;
  releasedAtIso?: string | null;
  confiscated?: boolean;
  ohadaFirstDemand?: boolean;
}

export type SecurityExpirySeverity = 'EXPIRED' | 'CRITICAL' | 'WARNING';

export interface SecurityExpiryAlert {
  securityId: string;
  contractOrBidRef: string;
  supplierName: string;
  securityType: SecurityInstrumentType;
  issuerInstitution: string;
  referenceNumber: string;
  amountFcfa: number;
  expiryDateIso: string;
  daysRemaining: number;
  severity: SecurityExpirySeverity;
  recommendedAction: string;
}

export interface SecuritiesExpiryReport {
  referenceDateIso: string;
  evaluatedActiveCount: number;
  alerts: SecurityExpiryAlert[];
  expiredCount: number;
  criticalCount: number;
  warningCount: number;
  totalAtRiskAmountFcfa: number;
}

/**
 * Evalue les cautions bancaires OHADA (Acte Uniforme Sûretés - Garantie autonome à première demande)
 * et assurances chantiers actives (non mainlevées et non confisquées) :
 * - EXPIRED  : daysRemaining < 0
 * - CRITICAL : 0 <= daysRemaining <= 7 jours
 * - WARNING  : 8 <= daysRemaining <= 30 jours
 */
export function evaluateSecuritiesExpiry(
  securities: SecurityRecordInput[],
  referenceDate: Date = new Date()
): SecuritiesExpiryReport {
  const refUtc = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate()
    )
  );
  const active = securities.filter((s) => !s.releasedAtIso && !s.confiscated);

  const alerts: SecurityExpiryAlert[] = [];

  for (const sec of active) {
    const expParsed = new Date(sec.expiryDateIso);
    if (Number.isNaN(expParsed.getTime())) continue;
    const expUtc = new Date(
      Date.UTC(expParsed.getUTCFullYear(), expParsed.getUTCMonth(), expParsed.getUTCDate())
    );
    const daysRemaining = Math.round(
      (expUtc.getTime() - refUtc.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (daysRemaining > 30) continue;

    let severity: SecurityExpirySeverity;
    let recommendedAction: string;
    if (daysRemaining < 0) {
      severity = 'EXPIRED';
      recommendedAction =
        'ALERTE CRITIQUE : Caution/Assurance expirée sans mainlevée — exiger un avenant de prorogation immédiat ou suspendre les paiements.';
    } else if (daysRemaining <= 7) {
      severity = 'CRITICAL';
      recommendedAction =
        `Échéance imminente (${daysRemaining}j) : notifier immédiatement le titulaire et l'établissement garant pour renouvellement sous peine de mise en jeu.`;
    } else {
      severity = 'WARNING';
      recommendedAction =
        `Échéance proche (${daysRemaining}j) : planifier la prorogation de validité ou la mainlevée si la réception est prononcée.`;
    }

    alerts.push({
      securityId: sec.id,
      contractOrBidRef: sec.contractOrBidRef,
      supplierName: sec.supplierName,
      securityType: sec.securityType,
      issuerInstitution: sec.issuerInstitution,
      referenceNumber: sec.referenceNumber,
      amountFcfa: roundFcfa(sec.amountFcfa),
      expiryDateIso: expUtc.toISOString().slice(0, 10),
      daysRemaining,
      severity,
      recommendedAction,
    });
  }

  alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    referenceDateIso: refUtc.toISOString().slice(0, 10),
    evaluatedActiveCount: active.length,
    alerts,
    expiredCount: alerts.filter((a) => a.severity === 'EXPIRED').length,
    criticalCount: alerts.filter((a) => a.severity === 'CRITICAL').length,
    warningCount: alerts.filter((a) => a.severity === 'WARNING').length,
    totalAtRiskAmountFcfa: roundFcfa(
      alerts.reduce((acc, a) => acc + a.amountFcfa, 0)
    ),
  };
}
