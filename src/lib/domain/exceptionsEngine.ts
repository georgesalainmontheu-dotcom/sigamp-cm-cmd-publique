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

// ============================================================================
// MATURATION DETAILLÉE (CIRCULAIRE N° 001/CAB/PM & DIRECTIVES MINEPAT)
// ============================================================================

export type MaturationPieceType =
  | 'APS_APD'
  | 'TDR'
  | 'DISPONIBILITE_SITE'
  | 'MERCURIALE_ESTIMATION'
  | 'EIES_NOTICE';

export type MaturationItemStatus =
  | 'MANQUANT'
  | 'EN_COURS'
  | 'VALIDE'
  | 'DISPENSE_JUSTIFIEE';

export interface MaturationItemRecord {
  pieceType: MaturationPieceType;
  label: string;
  mandatory: boolean;
  status: MaturationItemStatus;
  documentRef?: string;
  dispensationReason?: string;
  validatedBy?: string;
  validatedAtIso?: string;
}

export interface MaturationReadinessResult {
  canAdvanceToTechnicalAssignment: boolean;
  validatedCount: number;
  mandatoryCount: number;
  completionPct: number;
  blockingItems: string[];
  legalNote: string;
}

export function evaluateMaturationReadiness(
  items: MaturationItemRecord[]
): MaturationReadinessResult {
  const mandatoryItems = items.filter((i) => i.mandatory);
  const blockingItems: string[] = [];
  let okCount = 0;

  for (const item of mandatoryItems) {
    if (item.status === 'VALIDE') {
      okCount += 1;
    } else if (item.status === 'DISPENSE_JUSTIFIEE') {
      if (item.dispensationReason && item.dispensationReason.trim().length >= 10) {
        okCount += 1;
      } else {
        blockingItems.push(
          `${item.label} : dispense déclarée sans motif juridique documenté (>= 10 caractères).`
        );
      }
    } else {
      blockingItems.push(`${item.label} (${item.status})`);
    }
  }

  const totalCount = mandatoryItems.length || 1;
  const completionPct = Math.round((okCount / totalCount) * 100);

  return {
    canAdvanceToTechnicalAssignment: blockingItems.length === 0 && mandatoryItems.length > 0,
    validatedCount: okCount,
    mandatoryCount: mandatoryItems.length,
    completionPct,
    blockingItems,
    legalNote:
      'Circulaire n° 001/CAB/PM : aucune passation ne peut être lancée sans dossier complet de maturation (études, foncier/site, mercuriale, EIES).',
  };
}

// ============================================================================
// DETECTION OFFRE ANORMALEMENT BASSE (OAB - ART. 96-104 CMP & DEVIS CONFIDENTIEL)
// ============================================================================

export interface OabDetectionInput {
  confidentialEstimateTtc: number;
  technicallyQualifiedBidsTtc: Array<{
    bidId: string;
    supplierName: string;
    amountTtc: number;
  }>;
  thresholdDropRatio?: number; // Défaut 0.15 (-15%)
}

export interface OabBidResult {
  bidId: string;
  supplierName: string;
  amountTtc: number;
  deviationFromReferencePct: number;
  isAbnormallyLow: boolean;
  requiresPriceSubDetailsRequest: boolean;
}

export interface OabDetectionSummary {
  confidentialEstimateTtc: number;
  bidsAverageTtc: number;
  weightedReferenceTtc: number; // 40% Devis Confidentiel + 60% Moyenne Offres Conformes
  oabCutoffTtc: number;
  results: OabBidResult[];
}

export function detectAbnormallyLowBid(input: OabDetectionInput): OabDetectionSummary {
  const dropRatio = input.thresholdDropRatio ?? 0.15;
  const bids = input.technicallyQualifiedBidsTtc;
  const bidsAverageTtc =
    bids.length > 0
      ? roundFcfa(bids.reduce((acc, b) => acc + b.amountTtc, 0) / bids.length)
      : input.confidentialEstimateTtc;

  const weightedReferenceTtc = roundFcfa(
    0.4 * input.confidentialEstimateTtc + 0.6 * bidsAverageTtc
  );
  const oabCutoffTtc = roundFcfa(weightedReferenceTtc * (1 - dropRatio));

  const results: OabBidResult[] = bids.map((b) => {
    const deviationPct =
      weightedReferenceTtc > 0
        ? Number((((b.amountTtc - weightedReferenceTtc) / weightedReferenceTtc) * 100).toFixed(2))
        : 0;
    const isAbnormallyLow = b.amountTtc < oabCutoffTtc;
    return {
      bidId: b.bidId,
      supplierName: b.supplierName,
      amountTtc: roundFcfa(b.amountTtc),
      deviationFromReferencePct: deviationPct,
      isAbnormallyLow,
      requiresPriceSubDetailsRequest: isAbnormallyLow,
    };
  });

  return {
    confidentialEstimateTtc: roundFcfa(input.confidentialEstimateTtc),
    bidsAverageTtc,
    weightedReferenceTtc,
    oabCutoffTtc,
    results,
  };
}

// ============================================================================
// RECEPTIONS PROVISOIRE & DEFINITIVE, RESERVES & MAINLEVEE (ART. 155-164 CMP)
// ============================================================================

export interface ProvisionalReceptionInput {
  receptionDateIso: string;
  warrantyDurationMonths: number; // 6 à 12 mois selon CCAP
  hasReserves: boolean;
  reservesList: string[];
  reservesLiftDeadlineIso?: string;
  reservesLiftedAtIso?: string | null;
  attendanceSignedCount: number;
  quorumRequiredCount: number;
}

export interface ProvisionalReceptionEvaluation {
  canSignProvisionalPv: boolean;
  provisionalDecision: 'PRONONCEE_SANS_RESERVE' | 'PRONONCEE_AVEC_RESERVES' | 'AJOURNEE_QUORUM';
  warrantyEndDateIso: string;
  canReleasePerformanceBond: boolean;
  blockingReasons: string[];
}

export function evaluateProvisionalReception(
  input: ProvisionalReceptionInput
): ProvisionalReceptionEvaluation {
  const blockingReasons: string[] = [];
  if (input.attendanceSignedCount < input.quorumRequiredCount) {
    blockingReasons.push(
      `Quorum de la commission de réception non atteint (${input.attendanceSignedCount}/${input.quorumRequiredCount} membres émargés).`
    );
  }
  if (input.hasReserves && input.reservesList.length === 0) {
    blockingReasons.push('Réserves cochées mais liste des réserves techniques vide.');
  }
  if (input.hasReserves && !input.reservesLiftDeadlineIso) {
    blockingReasons.push('Délai impératif de levée des réserves manquant.');
  }

  const baseDate = new Date(input.receptionDateIso);
  const warrantyEnd = new Date(baseDate.getTime());
  warrantyEnd.setUTCMonth(warrantyEnd.getUTCMonth() + input.warrantyDurationMonths);

  const reservesRemaining = input.hasReserves && !input.reservesLiftedAtIso;
  if (reservesRemaining) {
    blockingReasons.push(
      'Mainlevée du cautionnement de bonne exécution bloquée jusqu’à constatation écrite de la levée des réserves.'
    );
  }

  const quorumOk = input.attendanceSignedCount >= input.quorumRequiredCount;
  const provisionalDecision = !quorumOk
    ? 'AJOURNEE_QUORUM'
    : input.hasReserves
      ? 'PRONONCEE_AVEC_RESERVES'
      : 'PRONONCEE_SANS_RESERVE';

  return {
    canSignProvisionalPv: quorumOk && (!input.hasReserves || Boolean(input.reservesLiftDeadlineIso)),
    provisionalDecision,
    warrantyEndDateIso: warrantyEnd.toISOString().slice(0, 10),
    canReleasePerformanceBond: quorumOk && !reservesRemaining,
    blockingReasons,
  };
}

export interface FinalReceptionInput {
  provisionalReceptionPronounced: boolean;
  reservesLifted: boolean;
  warrantyEndDateIso: string;
  evaluationDateIso: string;
  retentionGuaranteeTotalFcfa: number;
  dgdNetBalanceFcfa: number;
  attendanceSignedCount: number;
  quorumRequiredCount: number;
}

export interface FinalReceptionEvaluation {
  eligibleForFinalReception: boolean;
  daysUntilWarrantyEnd: number;
  canReleaseRetentionGuarantee: boolean;
  retentionToReleaseFcfa: number;
  dgdLiquidationStatus: 'PRET_POUR_MANDATEMENT' | 'BLOQUE';
  blockingReasons: string[];
}

export function evaluateFinalReception(
  input: FinalReceptionInput
): FinalReceptionEvaluation {
  const blockingReasons: string[] = [];

  if (!input.provisionalReceptionPronounced) {
    blockingReasons.push('La réception provisoire préalable n’est pas encore prononcée.');
  }
  if (!input.reservesLifted) {
    blockingReasons.push('Les réserves de la réception provisoire ne sont pas encore levées.');
  }
  if (input.attendanceSignedCount < input.quorumRequiredCount) {
    blockingReasons.push(
      `Quorum commission de réception définitive non atteint (${input.attendanceSignedCount}/${input.quorumRequiredCount}).`
    );
  }

  const endMs = new Date(input.warrantyEndDateIso).getTime();
  const evalMs = new Date(input.evaluationDateIso).getTime();
  const daysUntilWarrantyEnd = Math.ceil((endMs - evalMs) / (24 * 60 * 60 * 1000));

  if (daysUntilWarrantyEnd > 0) {
    blockingReasons.push(
      `Délai de garantie contractuel non expiré (${daysUntilWarrantyEnd} jour(s) restant(s) jusqu’au ${input.warrantyEndDateIso.slice(0, 10)}).`
    );
  }

  const eligible = blockingReasons.length === 0;

  return {
    eligibleForFinalReception: eligible,
    daysUntilWarrantyEnd: Math.max(0, daysUntilWarrantyEnd),
    canReleaseRetentionGuarantee: eligible,
    retentionToReleaseFcfa: eligible ? roundFcfa(input.retentionGuaranteeTotalFcfa) : 0,
    dgdLiquidationStatus: eligible ? 'PRET_POUR_MANDATEMENT' : 'BLOQUE',
    blockingReasons,
  };
}

