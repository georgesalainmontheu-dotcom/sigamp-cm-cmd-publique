import type {
  CommissionType,
  IndemnityTriggerEvent,
  ProcurementMode,
  RbacRole,
} from '../../types/domain';
import { roundFcfa } from './billingEngine';

/**
 * Moteur 3 : Moteur de Calcul Automatique des Indemnités & Primes
 * (SIGAMP, CIPM/CRPM/CDPM, SCA, Commissions de Réception, Observateurs ARMP, Missions).
 */

export interface IndemnityScale {
  id: string;
  entityId: string | null; // null = barème national par défaut
  fiscalYear: number;
  scaleName: string;
  legalReference: string;
  commissionType: CommissionType | null;
  roleCode: RbacRole;
  triggerEvent: IndemnityTriggerEvent;
  procurementMode: ProcurementMode | null;
  contractAmountMinFcfa: number;
  contractAmountMaxFcfa: number | null;
  baseAmountFcfa: number;
  perLotBonusFcfa: number;
  perBidBonusFcfa: number;
  dailyMissionAllowanceFcfa: number;
  transportRatePerKmFcfa: number;
  taxWithholdingRate: number;
  sessionCapFcfa: number | null;
  monthlyCapFcfa: number | null;
  annualCapFcfa: number | null;
  active: boolean;
}

export interface SessionAttendanceRecord {
  attendanceId: string;
  userId: string;
  fullName: string;
  roleCode: RbacRole;
  isPresent: boolean;
  missionDays?: number;
  distanceKm?: number;
}

export interface BudgetLineSnapshot {
  budgetLineId: string;
  chapitre: string;
  article: string;
  initialAllocationFcfa: number;
  committedFcfa: number;
}

export interface BeneficiaryCumulativeTotals {
  monthlyGrossFcfa: number;
  annualGrossFcfa: number;
}

export interface IndemnityCalculationInput {
  entityId: string;
  fiscalYear: number;
  triggerEvent: IndemnityTriggerEvent;
  commissionType: CommissionType | null;
  procurementMode: ProcurementMode;
  contractAmountTtc: number;
  lotsCount: number;
  bidsCount: number;
  scales: IndemnityScale[];
  attendances: SessionAttendanceRecord[];
  budgetLine: BudgetLineSnapshot;
  existingBeneficiaryTotals?: Record<string, BeneficiaryCumulativeTotals>;
}

export interface CalculatedIndemnityItem {
  attendanceId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  roleCode: RbacRole;
  scaleId: string;
  scaleName: string;
  legalReference: string;
  breakdown: {
    baseAmountFcfa: number;
    lotsBonusFcfa: number;
    bidsBonusFcfa: number;
    missionAllowanceFcfa: number;
    transportFcfa: number;
    uncappedGrossFcfa: number;
    sessionCapApplied: boolean;
  };
  grossAmountFcfa: number;
  withholdingFcfa: number;
  netAmountFcfa: number;
  capExceededWarning: boolean;
  capWarningDetails: string[];
}

export interface ExcludedActorRecord {
  attendanceId: string;
  userId: string;
  fullName: string;
  roleCode: RbacRole;
  reason: string;
}

export interface IndemnityLiquidationState {
  triggerEvent: IndemnityTriggerEvent;
  items: CalculatedIndemnityItem[];
  excludedActors: ExcludedActorRecord[];
  totalGrossFcfa: number;
  totalWithholdingFcfa: number;
  totalNetFcfa: number;
  budgetAvailableBeforeFcfa: number;
  budgetRemainingAfterFcfa: number;
  isBudgetSufficient: boolean;
  budgetShortfallFcfa: number;
  canSubmitForVisaCf: boolean;
}

function selectMatchingScale(
  scales: IndemnityScale[],
  params: {
    entityId: string;
    fiscalYear: number;
    triggerEvent: IndemnityTriggerEvent;
    roleCode: RbacRole;
    commissionType: CommissionType | null;
    procurementMode: ProcurementMode;
    contractAmountTtc: number;
  }
): IndemnityScale | null {
  const candidates = scales.filter((s) => {
    if (!s.active) return false;
    if (s.fiscalYear !== params.fiscalYear) return false;
    if (s.entityId !== null && s.entityId !== params.entityId) return false;
    if (s.triggerEvent !== params.triggerEvent) return false;
    if (s.roleCode !== params.roleCode) return false;
    if (s.commissionType !== null && s.commissionType !== params.commissionType) return false;
    if (s.procurementMode !== null && s.procurementMode !== params.procurementMode) return false;
    if (params.contractAmountTtc < s.contractAmountMinFcfa) return false;
    if (s.contractAmountMaxFcfa !== null && params.contractAmountTtc > s.contractAmountMaxFcfa) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Priorité : 1) Barème spécifique à l'entité > national ; 2) commission/mode précis > générique
  candidates.sort((a, b) => {
    const scoreA =
      (a.entityId !== null ? 8 : 0) +
      (a.commissionType !== null ? 4 : 0) +
      (a.procurementMode !== null ? 2 : 0) +
      (a.contractAmountMaxFcfa !== null ? 1 : 0);
    const scoreB =
      (b.entityId !== null ? 8 : 0) +
      (b.commissionType !== null ? 4 : 0) +
      (b.procurementMode !== null ? 2 : 0) +
      (b.contractAmountMaxFcfa !== null ? 1 : 0);
    return scoreB - scoreA;
  });

  return candidates[0] ?? null;
}

export function calculateIndemnityLiquidation(
  input: IndemnityCalculationInput
): IndemnityLiquidationState {
  const items: CalculatedIndemnityItem[] = [];
  const excludedActors: ExcludedActorRecord[] = [];
  const totalsMap = input.existingBeneficiaryTotals ?? {};

  for (const att of input.attendances) {
    if (!att.isPresent) {
      excludedActors.push({
        attendanceId: att.attendanceId,
        userId: att.userId,
        fullName: att.fullName,
        roleCode: att.roleCode,
        reason: 'Membre marqué absent sur la feuille de présence émargée.',
      });
      continue;
    }

    const scale = selectMatchingScale(input.scales, {
      entityId: input.entityId,
      fiscalYear: input.fiscalYear,
      triggerEvent: input.triggerEvent,
      roleCode: att.roleCode,
      commissionType: input.commissionType,
      procurementMode: input.procurementMode,
      contractAmountTtc: input.contractAmountTtc,
    });

    if (!scale) {
      excludedActors.push({
        attendanceId: att.attendanceId,
        userId: att.userId,
        fullName: att.fullName,
        roleCode: att.roleCode,
        reason: `Aucun barème actif trouvé pour le rôle ${att.roleCode} sur l’acte ${input.triggerEvent}.`,
      });
      continue;
    }

    const extraLots = Math.max(0, input.lotsCount - 1);
    const lotsBonusFcfa = roundFcfa(scale.perLotBonusFcfa * extraLots);
    const bidsBonusFcfa = roundFcfa(scale.perBidBonusFcfa * Math.max(0, input.bidsCount));
    const missionAllowanceFcfa = roundFcfa(
      scale.dailyMissionAllowanceFcfa * Math.max(0, att.missionDays ?? 0)
    );
    const transportFcfa = roundFcfa(
      scale.transportRatePerKmFcfa * Math.max(0, att.distanceKm ?? 0)
    );

    const uncappedGrossFcfa =
      roundFcfa(scale.baseAmountFcfa) +
      lotsBonusFcfa +
      bidsBonusFcfa +
      missionAllowanceFcfa +
      transportFcfa;

    let grossAmountFcfa = uncappedGrossFcfa;
    let sessionCapApplied = false;
    if (scale.sessionCapFcfa !== null && grossAmountFcfa > scale.sessionCapFcfa) {
      grossAmountFcfa = roundFcfa(scale.sessionCapFcfa);
      sessionCapApplied = true;
    }

    const capWarningDetails: string[] = [];
    const existing = totalsMap[att.userId] ?? { monthlyGrossFcfa: 0, annualGrossFcfa: 0 };

    if (
      scale.monthlyCapFcfa !== null &&
      existing.monthlyGrossFcfa + grossAmountFcfa > scale.monthlyCapFcfa
    ) {
      capWarningDetails.push(
        `Plafond mensuel dépassé (${(existing.monthlyGrossFcfa + grossAmountFcfa).toLocaleString('fr-FR')} > ${scale.monthlyCapFcfa.toLocaleString('fr-FR')} FCFA).`
      );
    }
    if (
      scale.annualCapFcfa !== null &&
      existing.annualGrossFcfa + grossAmountFcfa > scale.annualCapFcfa
    ) {
      capWarningDetails.push(
        `Plafond annuel dépassé (${(existing.annualGrossFcfa + grossAmountFcfa).toLocaleString('fr-FR')} > ${scale.annualCapFcfa.toLocaleString('fr-FR')} FCFA).`
      );
    }

    const withholdingFcfa = roundFcfa(grossAmountFcfa * scale.taxWithholdingRate);
    const netAmountFcfa = Math.max(0, grossAmountFcfa - withholdingFcfa);

    items.push({
      attendanceId: att.attendanceId,
      beneficiaryId: att.userId,
      beneficiaryName: att.fullName,
      roleCode: att.roleCode,
      scaleId: scale.id,
      scaleName: scale.scaleName,
      legalReference: scale.legalReference,
      breakdown: {
        baseAmountFcfa: roundFcfa(scale.baseAmountFcfa),
        lotsBonusFcfa,
        bidsBonusFcfa,
        missionAllowanceFcfa,
        transportFcfa,
        uncappedGrossFcfa,
        sessionCapApplied,
      },
      grossAmountFcfa,
      withholdingFcfa,
      netAmountFcfa,
      capExceededWarning: capWarningDetails.length > 0,
      capWarningDetails,
    });
  }

  const totalGrossFcfa = items.reduce((s, it) => s + it.grossAmountFcfa, 0);
  const totalWithholdingFcfa = items.reduce((s, it) => s + it.withholdingFcfa, 0);
  const totalNetFcfa = items.reduce((s, it) => s + it.netAmountFcfa, 0);

  const budgetAvailableBeforeFcfa = Math.max(
    0,
    input.budgetLine.initialAllocationFcfa - input.budgetLine.committedFcfa
  );
  const isBudgetSufficient = totalGrossFcfa <= budgetAvailableBeforeFcfa;
  const budgetRemainingAfterFcfa = isBudgetSufficient
    ? budgetAvailableBeforeFcfa - totalGrossFcfa
    : 0;
  const budgetShortfallFcfa = isBudgetSufficient
    ? 0
    : totalGrossFcfa - budgetAvailableBeforeFcfa;

  return {
    triggerEvent: input.triggerEvent,
    items,
    excludedActors,
    totalGrossFcfa,
    totalWithholdingFcfa,
    totalNetFcfa,
    budgetAvailableBeforeFcfa,
    budgetRemainingAfterFcfa,
    isBudgetSufficient,
    budgetShortfallFcfa,
    canSubmitForVisaCf: items.length > 0 && isBudgetSufficient,
  };
}
