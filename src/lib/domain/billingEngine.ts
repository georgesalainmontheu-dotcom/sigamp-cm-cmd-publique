import type { ContractType, FiscalRegime } from '../../types/domain';

/**
 * Moteur 2 : Moteur Fiscal, Liquidation des Décomptes & Détection OAB
 * (CGI Cameroun + Code des Marchés Publics Décret n° 2018/366).
 */

export const CAMEROON_TAX_DEFAULTS = {
  TVA_RATE: 0.1925,              // 17,5% principal + 10% CAC = 19,25%
  AIR_REEL_RATE: 0.022,          // 2,2% régime du réel avec attestation de non-redevance
  AIR_SIMPLIFIE_RATE: 0.055,     // 5,5% régime simplifié / défaut attestation
  TSR_NON_RESIDENT_RATE: 0.15,   // 15% prestataire étranger non domicilié
  GUARANTEE_RETENTION_RATE: 0.1, // 10% retenue de garantie
  MAX_PENALTY_CAP_RATE: 0.1,     // Plafond légal des pénalités à 10% du montant du marché
  DE_STANDARD_RATE: 0.02,        // 2% droits d'enregistrement marchés/LC publics
  DE_SPECIAL_RATE: 0.05,         // 5% selon nature particulière de l'acte
} as const;

export function roundFcfa(amount: number): number {
  return Math.round(amount);
}

export function resolveIrRate(
  fiscalRegime: FiscalRegime,
  hasValidNonRedevance: boolean
): { irRate: number; tsrRate: number } {
  if (fiscalRegime === 'ETRANGER_NON_RESIDENT') {
    return { irRate: 0, tsrRate: CAMEROON_TAX_DEFAULTS.TSR_NON_RESIDENT_RATE };
  }
  if (fiscalRegime === 'REEL' && hasValidNonRedevance) {
    return { irRate: CAMEROON_TAX_DEFAULTS.AIR_REEL_RATE, tsrRate: 0 };
  }
  // Régime simplifié, libératoire ou défaut d'attestation de non-redevance -> 5,5%
  return { irRate: CAMEROON_TAX_DEFAULTS.AIR_SIMPLIFIE_RATE, tsrRate: 0 };
}

export function computeRegistrationDuty(
  amountHt: number,
  customRate?: number
): { rate: number; amountFcfa: number } {
  if (amountHt < 0) throw new Error('Le montant HT ne peut pas être négatif.');
  const rate = customRate ?? CAMEROON_TAX_DEFAULTS.DE_STANDARD_RATE;
  return {
    rate,
    amountFcfa: roundFcfa(amountHt * rate),
  };
}

export interface DelayPenaltyInput {
  contractAmountTtc: number;
  delayDays: number;
  weatherExcusedDays?: number;
  previousPenaltiesFcfa?: number;
  maxCapRate?: number;
}

export interface DelayPenaltyResult {
  grossDelayDays: number;
  weatherExcusedDays: number;
  netDelayDays: number;
  rawPenaltyFcfa: number;
  cappedPenaltyFcfa: number;
  capRemainingBeforeFcfa: number;
  isCapReached: boolean;
}

/**
 * Calcul progressif CMP Cameroun :
 * - Jours 1 à 30 : 1/2000e du montant initial TTC par jour calendaire
 * - Au-delà du 30e jour : 1/1000e par jour calendaire
 * - Plafonné à 10% du montant du marché TTC (cumul inclus).
 */
export function calculateDelayPenalties(input: DelayPenaltyInput): DelayPenaltyResult {
  const netDelayDays = Math.max(0, input.delayDays - (input.weatherExcusedDays ?? 0));
  const capRate = input.maxCapRate ?? CAMEROON_TAX_DEFAULTS.MAX_PENALTY_CAP_RATE;
  const maxTotalPenalty = roundFcfa(input.contractAmountTtc * capRate);
  const previous = Math.max(0, input.previousPenaltiesFcfa ?? 0);
  const capRemainingBeforeFcfa = Math.max(0, maxTotalPenalty - previous);

  let rawPenalty = 0;
  if (netDelayDays > 0) {
    const tier1Days = Math.min(netDelayDays, 30);
    const tier2Days = Math.max(0, netDelayDays - 30);
    rawPenalty =
      (tier1Days * input.contractAmountTtc) / 2000 +
      (tier2Days * input.contractAmountTtc) / 1000;
  }

  const rawPenaltyFcfa = roundFcfa(rawPenalty);
  const cappedPenaltyFcfa = Math.min(rawPenaltyFcfa, capRemainingBeforeFcfa);

  return {
    grossDelayDays: input.delayDays,
    weatherExcusedDays: input.weatherExcusedDays ?? 0,
    netDelayDays,
    rawPenaltyFcfa,
    cappedPenaltyFcfa,
    capRemainingBeforeFcfa,
    isCapReached: previous + cappedPenaltyFcfa >= maxTotalPenalty && maxTotalPenalty > 0,
  };
}

export interface DecompteCalculationInput {
  contractType: ContractType;
  contractInitialAmountTtc: number;
  grossAmountHt: number;
  fiscalRegime: FiscalRegime;
  hasValidNonRedevance: boolean;
  tvaRate?: number;
  tvaWithheldAtSource?: boolean;
  /** Montant exact ou taux de remboursement au prorata de l'avance de démarrage */
  advanceRepaymentFcfa?: number;
  startAdvanceProrataRate?: number;
  /** Retenue de garantie (10% par défaut sauf caution de remplacement) */
  hasReplacementGuaranteeBond?: boolean;
  guaranteeRetentionRate?: number;
  delayDays?: number;
  weatherExcusedDays?: number;
  previousPenaltiesFcfa?: number;
  /** Applicable uniquement à titre informatif lors de la vérification fiscale du contrat */
  registrationDutyRate?: number;
}

export interface DecompteCalculationResult {
  grossAmountHt: number;
  advanceRepaymentFcfa: number;
  guaranteeRetentionFcfa: number;
  netHtBaseAfterDeductions: number;
  penaltyDetails: DelayPenaltyResult;
  tvaRate: number;
  tvaAmountFcfa: number;
  tvaWithheldAtSource: boolean;
  irRate: number;
  irAirAmountFcfa: number;
  tsrRate: number;
  tsrAmountFcfa: number;
  registrationDutyReferenceFcfa: number;
  grossAmountTtc: number;
  netPayableSupplierFcfa: number;
  treasuryReversementFcfa: number;
}

export function calculateDecompte(
  input: DecompteCalculationInput
): DecompteCalculationResult {
  if (input.grossAmountHt < 0) {
    throw new Error('Le montant brut HT du décompte ne peut pas être négatif.');
  }

  const tvaRate = input.tvaRate ?? CAMEROON_TAX_DEFAULTS.TVA_RATE;
  const tvaWithheldAtSource = input.tvaWithheldAtSource ?? true;
  const { irRate, tsrRate } = resolveIrRate(
    input.fiscalRegime,
    input.hasValidNonRedevance
  );

  // 1. Remboursement au prorata de l'avance de démarrage
  const advanceRepaymentFcfa =
    input.advanceRepaymentFcfa !== undefined
      ? roundFcfa(input.advanceRepaymentFcfa)
      : roundFcfa(input.grossAmountHt * (input.startAdvanceProrataRate ?? 0));

  // 2. Retenue de garantie (10% sur HT exécuté, 0 si caution bancaire de remplacement)
  const retentionRate = input.hasReplacementGuaranteeBond
    ? 0
    : (input.guaranteeRetentionRate ?? CAMEROON_TAX_DEFAULTS.GUARANTEE_RETENTION_RATE);
  const guaranteeRetentionFcfa = roundFcfa(input.grossAmountHt * retentionRate);

  const netHtBaseAfterDeductions = Math.max(
    0,
    input.grossAmountHt - advanceRepaymentFcfa - guaranteeRetentionFcfa
  );

  // 3. Pénalités de retard plafonnées à 10%
  const penaltyDetails = calculateDelayPenalties({
    contractAmountTtc: input.contractInitialAmountTtc,
    delayDays: input.delayDays ?? 0,
    weatherExcusedDays: input.weatherExcusedDays ?? 0,
    previousPenaltiesFcfa: input.previousPenaltiesFcfa ?? 0,
  });

  // 4. Fiscalité camerounaise (TVA 19,25% + AIR 2,2%/5,5% ou TSR 15% calculés sur le brut HT facturé)
  const tvaAmountFcfa = roundFcfa(input.grossAmountHt * tvaRate);
  const irAirAmountFcfa = roundFcfa(input.grossAmountHt * irRate);
  const tsrAmountFcfa = roundFcfa(input.grossAmountHt * tsrRate);
  const grossAmountTtc = input.grossAmountHt + tvaAmountFcfa;

  const registrationDutyReferenceFcfa = computeRegistrationDuty(
    input.grossAmountHt,
    input.registrationDutyRate
  ).amountFcfa;

  // 5. Ventilation Trésor Public vs Net à Payer au Titulaire
  const treasuryReversementFcfa =
    (tvaWithheldAtSource ? tvaAmountFcfa : 0) + irAirAmountFcfa + tsrAmountFcfa;

  const netPayableSupplierFcfa = Math.max(
    0,
    grossAmountTtc -
      treasuryReversementFcfa -
      advanceRepaymentFcfa -
      guaranteeRetentionFcfa -
      penaltyDetails.cappedPenaltyFcfa
  );

  return {
    grossAmountHt: roundFcfa(input.grossAmountHt),
    advanceRepaymentFcfa,
    guaranteeRetentionFcfa,
    netHtBaseAfterDeductions: roundFcfa(netHtBaseAfterDeductions),
    penaltyDetails,
    tvaRate,
    tvaAmountFcfa,
    tvaWithheldAtSource,
    irRate,
    irAirAmountFcfa,
    tsrRate,
    tsrAmountFcfa,
    registrationDutyReferenceFcfa,
    grossAmountTtc,
    netPayableSupplierFcfa,
    treasuryReversementFcfa,
  };
}

// ============================================================================
// ALGORITHME DE DETECTION DES OFFRES ANORMALEMENT BASSES (OAB)
// ============================================================================

export interface BidFinancialInput {
  bidId: string;
  supplierName: string;
  amountTtc: number;
}

export interface OabDetectionOptions {
  ownerEstimateTtc: number;
  bids: BidFinancialInput[];
  /** Pondération estimation MO (défaut 0.40) vs moyenne des offres (défaut 0.60) */
  ownerWeight?: number;
  bidsWeight?: number;
  /** Seuil d'anomalie par rapport à la référence pondérée (défaut 0.85 => -15%) */
  anomalyRatioThreshold?: number;
}

export interface OabBidAnalysis {
  bidId: string;
  supplierName: string;
  amountTtc: number;
  ratioToBaseline: number;
  deviationPct: number;
  isOabSuspected: boolean;
  requiresPriceSubDetailJustification: boolean;
}

export interface OabDetectionReport {
  ownerEstimateTtc: number;
  bidsMeanTtc: number;
  weightedBaselineTtc: number;
  oabThresholdAmountTtc: number;
  analyses: OabBidAnalysis[];
  flaggedCount: number;
}

export function detectAbnormalLowBids(
  options: OabDetectionOptions
): OabDetectionReport {
  if (options.ownerEstimateTtc <= 0) {
    throw new Error('L’estimation du Maître d’Ouvrage doit être strictement positive.');
  }
  if (options.bids.length === 0) {
    throw new Error('Au moins une offre financière conforme est requise pour l’analyse OAB.');
  }

  const ownerWeight = options.ownerWeight ?? 0.4;
  const bidsWeight = options.bidsWeight ?? 0.6;
  const anomalyRatio = options.anomalyRatioThreshold ?? 0.85;

  const bidsSum = options.bids.reduce((acc, b) => acc + b.amountTtc, 0);
  const bidsMeanTtc = bidsSum / options.bids.length;

  const weightedBaselineTtc =
    (options.ownerEstimateTtc * ownerWeight + bidsMeanTtc * bidsWeight) /
    (ownerWeight + bidsWeight);

  const oabThresholdAmountTtc = weightedBaselineTtc * anomalyRatio;

  const analyses: OabBidAnalysis[] = options.bids.map((bid) => {
    const ratio = bid.amountTtc / weightedBaselineTtc;
    const deviationPct = Number(((ratio - 1) * 100).toFixed(2));
    const isOabSuspected = bid.amountTtc < oabThresholdAmountTtc;

    return {
      bidId: bid.bidId,
      supplierName: bid.supplierName,
      amountTtc: bid.amountTtc,
      ratioToBaseline: Number(ratio.toFixed(4)),
      deviationPct,
      isOabSuspected,
      requiresPriceSubDetailJustification: isOabSuspected,
    };
  });

  return {
    ownerEstimateTtc: options.ownerEstimateTtc,
    bidsMeanTtc: roundFcfa(bidsMeanTtc),
    weightedBaselineTtc: roundFcfa(weightedBaselineTtc),
    oabThresholdAmountTtc: roundFcfa(oabThresholdAmountTtc),
    analyses,
    flaggedCount: analyses.filter((a) => a.isOabSuspected).length,
  };
}

// ============================================================================
// CALCUL DE DATE CONTRACTUELLE AJUSTEE PAR ORDRES DE SERVICE (ARRET / REPRISE)
// ============================================================================

export interface ServiceOrderTimelineEvent {
  osNumber: string;
  osType: 'DEMARRAGE' | 'ARRET' | 'REPRISE' | 'TECHNIQUE' | 'MISE_EN_DEMEURE' | 'NOTIFICATION_AVENANT';
  effectiveDateIso: string;
  weatherExcusedDays?: number;
}

export interface AdjustedCompletionInput {
  /** Date de notification de l'Ordre de Service de Démarrage */
  startOrderDateIso: string;
  /** Durée contractuelle initiale en jours calendaires */
  initialDurationDays: number;
  /** Cumul des prolongations accordées par avenants */
  amendmentDurationDeltaDays?: number;
  /** Historique des Ordres de Service (ARRET, REPRISE, TECHNIQUE avec jours d'intempéries) */
  serviceOrders?: ServiceOrderTimelineEvent[];
  /** Date d'évaluation / constatation (par défaut aujourd'hui) */
  evaluationDateIso?: string;
}

export interface SuspensionInterval {
  arretOsNumber: string;
  arretDateIso: string;
  repriseOsNumber: string | null;
  repriseDateIso: string;
  suspendedDays: number;
  openEnded: boolean;
}

export interface AdjustedCompletionResult {
  startDateIso: string;
  initialCompletionDateIso: string;
  revisedCompletionDateIso: string;
  evaluationDateIso: string;
  initialDurationDays: number;
  amendmentDurationDeltaDays: number;
  suspendedDays: number;
  weatherExcusedDays: number;
  totalAdjustedDurationDays: number;
  actualDelayDays: number;
  isCurrentlySuspended: boolean;
  suspensionIntervals: SuspensionInterval[];
}

function toUtcDay(dateIso: string): Date {
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Date ISO invalide pour le calcul des délais contractuels : ${dateIso}`);
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function addDaysIso(date: Date, days: number): string {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out.toISOString().slice(0, 10);
}

/**
 * Calcule la date contractuelle révisée et le retard réel exigible à partir de :
 * - OS de démarrage + durée initiale
 * - Avenants de délai (`amendmentDurationDeltaDays`)
 * - Paires d'OS d'arrêt / reprise (`ARRET` / `REPRISE`)
 * - Jours d'intempéries excusés (`weatherExcusedDays`)
 */
export function calculateAdjustedCompletionDate(
  input: AdjustedCompletionInput
): AdjustedCompletionResult {
  if (!Number.isFinite(input.initialDurationDays) || input.initialDurationDays <= 0) {
    throw new Error('La durée initiale du marché doit être strictement positive.');
  }

  const startDate = toUtcDay(input.startOrderDateIso);
  const evaluationDate = toUtcDay(input.evaluationDateIso ?? new Date().toISOString());
  const amendmentDelta = Math.round(input.amendmentDurationDeltaDays ?? 0);

  const sortedOrders = [...(input.serviceOrders ?? [])].sort(
    (a, b) => toUtcDay(a.effectiveDateIso).getTime() - toUtcDay(b.effectiveDateIso).getTime()
  );

  const suspensionIntervals: SuspensionInterval[] = [];
  let activeArret: ServiceOrderTimelineEvent | null = null;
  let suspendedDays = 0;
  let weatherExcusedDays = 0;

  for (const os of sortedOrders) {
    if (os.weatherExcusedDays && os.weatherExcusedDays > 0) {
      weatherExcusedDays += Math.round(os.weatherExcusedDays);
    }

    if (os.osType === 'ARRET' && !activeArret) {
      activeArret = os;
    } else if (os.osType === 'REPRISE' && activeArret) {
      const arretDay = toUtcDay(activeArret.effectiveDateIso);
      const repriseDay = toUtcDay(os.effectiveDateIso);
      const diff = Math.max(
        0,
        Math.round((repriseDay.getTime() - arretDay.getTime()) / (24 * 60 * 60 * 1000))
      );
      suspendedDays += diff;
      suspensionIntervals.push({
        arretOsNumber: activeArret.osNumber,
        arretDateIso: arretDay.toISOString().slice(0, 10),
        repriseOsNumber: os.osNumber,
        repriseDateIso: repriseDay.toISOString().slice(0, 10),
        suspendedDays: diff,
        openEnded: false,
      });
      activeArret = null;
    }
  }

  let isCurrentlySuspended = false;
  if (activeArret) {
    const arretDay = toUtcDay(activeArret.effectiveDateIso);
    const diff = Math.max(
      0,
      Math.round((evaluationDate.getTime() - arretDay.getTime()) / (24 * 60 * 60 * 1000))
    );
    suspendedDays += diff;
    isCurrentlySuspended = true;
    suspensionIntervals.push({
      arretOsNumber: activeArret.osNumber,
      arretDateIso: arretDay.toISOString().slice(0, 10),
      repriseOsNumber: null,
      repriseDateIso: evaluationDate.toISOString().slice(0, 10),
      suspendedDays: diff,
      openEnded: true,
    });
  }

  const totalAdjustedDurationDays = Math.max(
    1,
    Math.round(input.initialDurationDays) + amendmentDelta + suspendedDays + weatherExcusedDays
  );

  const initialCompletionDateIso = addDaysIso(startDate, Math.round(input.initialDurationDays));
  const revisedCompletionDateIso = addDaysIso(startDate, totalAdjustedDurationDays);
  const revisedDateUtc = toUtcDay(revisedCompletionDateIso);

  const rawDelayDays = Math.round(
    (evaluationDate.getTime() - revisedDateUtc.getTime()) / (24 * 60 * 60 * 1000)
  );
  const actualDelayDays = !isCurrentlySuspended && rawDelayDays > 0 ? rawDelayDays : 0;

  return {
    startDateIso: startDate.toISOString().slice(0, 10),
    initialCompletionDateIso,
    revisedCompletionDateIso,
    evaluationDateIso: evaluationDate.toISOString().slice(0, 10),
    initialDurationDays: Math.round(input.initialDurationDays),
    amendmentDurationDeltaDays: amendmentDelta,
    suspendedDays,
    weatherExcusedDays,
    totalAdjustedDurationDays,
    actualDelayDays,
    isCurrentlySuspended,
    suspensionIntervals,
  };
}
