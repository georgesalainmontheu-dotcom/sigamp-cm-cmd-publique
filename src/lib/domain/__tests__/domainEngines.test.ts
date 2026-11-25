import { describe, expect, it } from 'vitest';
import {
  addBusinessDaysCameroon,
  calculateLegalTimeline,
  evaluateAddendumExtension,
  routeProcurementProcedure,
} from '../procurementRouter';
import {
  calculateDecompte,
  calculateDelayPenalties,
  computeRegistrationDuty,
  detectAbnormalLowBids,
} from '../billingEngine';
import {
  calculateIndemnityLiquidation,
  type IndemnityScale,
} from '../indemnityEngine';
import {
  calculateFaultTerminationLiquidation,
  evaluateAmendment,
  evaluateMiseEnDemeure,
} from '../exceptionsEngine';

describe('Moteur 1 : procurementRouter.ts (Seuils CMP & Rétroplanning)', () => {
  it('route < 5M FCFA vers un Bon de Commande Administratif sans commission CPM', () => {
    const res = routeProcurementProcedure({
      entityType: 'COMMUNE',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 4_200_000,
    });
    expect(res.contractType).toBe('BON_COMMANDE_ADMINISTRATIF');
    expect(res.recommendedMode).toBe('DC_COTATION');
    expect(res.primaryCommission).toBeNull();
    expect(res.requiresTutelleLegalityControl).toBe(true);
  });

  it('route 48M FCFA Travaux Commune vers Lettre-Commande AONO + CDPM', () => {
    const res = routeProcurementProcedure({
      entityType: 'COMMUNE',
      nature: 'TRAVAUX',
      estimatedAmountTtc: 48_000_000,
    });
    expect(res.contractType).toBe('LETTRE_COMMANDE');
    expect(res.recommendedMode).toBe('AONO');
    expect(res.primaryCommission).toBe('CDPM');
    expect(res.requiresCccmPriorOpinion).toBe(false);
    expect(res.requiresBilingualAao).toBe(true);
  });

  it('route >= 500M FCFA Travaux Ministère vers Marché AONO + CIPM + Avis conforme CCCM_TR', () => {
    const res = routeProcurementProcedure({
      entityType: 'MINISTERE',
      nature: 'TRAVAUX',
      estimatedAmountTtc: 650_000_000,
    });
    expect(res.contractType).toBe('MARCHE');
    expect(res.primaryCommission).toBe('CIPM');
    expect(res.requiresCccmPriorOpinion).toBe(true);
    expect(res.cccmOrgan).toBe('CCCM_TR');
    expect(res.requiresTutelleLegalityControl).toBe(false);
  });

  it('exige autorisation spéciale MINMAP pour un marché de Gré à Gré', () => {
    expect(() =>
      routeProcurementProcedure({
        entityType: 'EPA',
        nature: 'FOURNITURES',
        estimatedAmountTtc: 80_000_000,
        isGreAGreRequested: true,
      })
    ).toThrow();

    const ok = routeProcurementProcedure({
      entityType: 'EPA',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 80_000_000,
      isGreAGreRequested: true,
      greAGreJustification: 'URGENCE_IMPERIEUSE',
    });
    expect(ok.recommendedMode).toBe('GRE_A_GRE');
    expect(ok.requiresMinmapPriorAuth).toBe(true);
  });

  it('calcule les 90 jours de validité des offres et 5 jours ouvrables de standstill (sautant week-end et 20 mai)', () => {
    // 18 mai 2026 est un lundi -> +5 jours ouvrables en sautant le 20 mai (Fête Nationale) et sam/dim 23-24 mai -> 26 mai 2026
    const pub = new Date('2026-05-18T09:00:00Z');
    const standstillEnd = addBusinessDaysCameroon(pub, 5);
    expect(standstillEnd.toISOString().slice(0, 10)).toBe('2026-05-26');

    const timeline = calculateLegalTimeline({
      publicationDate: new Date('2026-03-01T09:00:00Z'),
      mode: 'AONO',
    });
    const diffValidityDays = Math.round(
      (timeline.offerValidityEndDate.getTime() - timeline.openingDate.getTime()) /
        (24 * 3600 * 1000)
    );
    expect(diffValidityDays).toBe(90);
  });

  it('impose une prorogation automatique si additif émis à moins de 7 jours de l’ouverture', () => {
    const deadline = new Date('2026-04-20T12:00:00Z');
    const issued = new Date('2026-04-16T12:00:00Z'); // J-4 (< 7 jours)
    const ext = evaluateAddendumExtension({
      currentSubmissionDeadline: deadline,
      addendumIssuedAt: issued,
      modifiesSubstantially: false,
    });
    expect(ext.extensionRequired).toBe(true);
    expect(ext.newSubmissionDeadline.toISOString().slice(0, 10)).toBe('2026-04-23');
    expect(ext.addedDays).toBe(3);
  });
});

describe('Moteur 2 : billingEngine.ts (Fiscalité Décomptes, Pénalités & OAB)', () => {
  it('calcule un décompte avec TVA 19,25% retenue à la source, AIR 2,2% (Régime Réel), retenue 10% et avance prorata', () => {
    const res = calculateDecompte({
      contractType: 'MARCHE',
      contractInitialAmountTtc: 119_250_000,
      grossAmountHt: 20_000_000,
      fiscalRegime: 'REEL',
      hasValidNonRedevance: true,
      tvaWithheldAtSource: true,
      startAdvanceProrataRate: 0.2, // 20% = 4 000 000
      delayDays: 0,
    });

    expect(res.tvaAmountFcfa).toBe(3_850_000);
    expect(res.irAirAmountFcfa).toBe(440_000); // 2,2%
    expect(res.guaranteeRetentionFcfa).toBe(2_000_000); // 10%
    expect(res.advanceRepaymentFcfa).toBe(4_000_000);
    expect(res.treasuryReversementFcfa).toBe(4_290_000); // TVA + AIR
    // Net à payer = 23 850 000 - 4 290 000 - 4 000 000 - 2 000 000 = 13 560 000
    expect(res.netPayableSupplierFcfa).toBe(13_560_000);
  });

  it('applique AIR 5,5% si attestation de non-redevance absente et calcule les droits d’enregistrement (2% et 5%)', () => {
    const res = calculateDecompte({
      contractType: 'LETTRE_COMMANDE',
      contractInitialAmountTtc: 23_850_000,
      grossAmountHt: 10_000_000,
      fiscalRegime: 'REEL',
      hasValidNonRedevance: false,
      hasReplacementGuaranteeBond: true,
    });
    expect(res.irRate).toBe(0.055);
    expect(res.irAirAmountFcfa).toBe(550_000);
    expect(res.guaranteeRetentionFcfa).toBe(0);
    expect(computeRegistrationDuty(10_000_000).amountFcfa).toBe(200_000);
    expect(computeRegistrationDuty(10_000_000, 0.05).amountFcfa).toBe(500_000);
  });

  it('plafonne les pénalités de retard à 10% du montant initial TTC', () => {
    const pen = calculateDelayPenalties({
      contractAmountTtc: 100_000_000,
      delayDays: 18 + 150, // net > 160 jours -> brut > 10%
      weatherExcusedDays: 5,
      previousPenaltiesFcfa: 2_000_000,
    });
    expect(pen.netDelayDays).toBe(163);
    expect(pen.cappedPenaltyFcfa).toBe(8_000_000); // 10M plafond - 2M déjà retenus
    expect(pen.isCapReached).toBe(true);
  });

  it('détecte les Offres Anormalement Basses (OAB) par rapport à la moyenne pondérée', () => {
    const report = detectAbnormalLowBids({
      ownerEstimateTtc: 100_000_000,
      bids: [
        { bidId: 'b1', supplierName: 'Alpha BTP', amountTtc: 98_000_000 },
        { bidId: 'b2', supplierName: 'Beta Constr', amountTtc: 96_000_000 },
        { bidId: 'b3', supplierName: 'Dump SARL', amountTtc: 65_000_000 },
      ],
    });
    expect(report.flaggedCount).toBe(1);
    const flagged = report.analyses.find((a) => a.bidId === 'b3');
    expect(flagged?.isOabSuspected).toBe(true);
    expect(flagged?.requiresPriceSubDetailJustification).toBe(true);
  });
});

describe('Moteur 3 : indemnityEngine.ts (Indemnités SIGAMP, CPM, SCA, Réception, ARMP)', () => {
  const sampleScales: IndemnityScale[] = [
    {
      id: 'sc-cpm-pres',
      entityId: null,
      fiscalYear: 2026,
      scaleName: 'Indemnité session Président CPM',
      legalReference: 'Décret 2013/271',
      commissionType: 'CDPM',
      roleCode: 'CPM_PRESIDENT',
      triggerEvent: 'OUVERTURE_PLIS',
      procurementMode: null,
      contractAmountMinFcfa: 0,
      contractAmountMaxFcfa: null,
      baseAmountFcfa: 50_000,
      perLotBonusFcfa: 5_000,
      perBidBonusFcfa: 0,
      dailyMissionAllowanceFcfa: 0,
      transportRatePerKmFcfa: 0,
      taxWithholdingRate: 0.11,
      sessionCapFcfa: null,
      monthlyCapFcfa: 300_000,
      annualCapFcfa: null,
      active: true,
    },
    {
      id: 'sc-sigamp-commune',
      entityId: 'ent-banka',
      fiscalYear: 2026,
      scaleName: 'Prime suivi SIGAMP Ouverture',
      legalReference: 'Délibération Municipale 2026',
      commissionType: null,
      roleCode: 'SIGAMP',
      triggerEvent: 'OUVERTURE_PLIS',
      procurementMode: 'AONO',
      contractAmountMinFcfa: 0,
      contractAmountMaxFcfa: null,
      baseAmountFcfa: 35_000,
      perLotBonusFcfa: 2_500,
      perBidBonusFcfa: 1_000,
      dailyMissionAllowanceFcfa: 0,
      transportRatePerKmFcfa: 0,
      taxWithholdingRate: 0,
      sessionCapFcfa: null,
      monthlyCapFcfa: null,
      annualCapFcfa: null,
      active: true,
    },
  ];

  it('calcule les indemnités des présents, exclut les absents et contrôle la ligne budgétaire', () => {
    const state = calculateIndemnityLiquidation({
      entityId: 'ent-banka',
      fiscalYear: 2026,
      triggerEvent: 'OUVERTURE_PLIS',
      commissionType: 'CDPM',
      procurementMode: 'AONO',
      contractAmountTtc: 48_000_000,
      lotsCount: 2,
      bidsCount: 4,
      scales: sampleScales,
      attendances: [
        {
          attendanceId: 'att-1',
          userId: 'u-pres',
          fullName: 'Président CDPM',
          roleCode: 'CPM_PRESIDENT',
          isPresent: true,
        },
        {
          attendanceId: 'att-2',
          userId: 'u-sigamp',
          fullName: 'Chef SIGAMP',
          roleCode: 'SIGAMP',
          isPresent: true,
        },
        {
          attendanceId: 'att-3',
          userId: 'u-absent',
          fullName: 'Membre Absent',
          roleCode: 'CPM_MEMBRE',
          isPresent: false,
        },
      ],
      budgetLine: {
        budgetLineId: 'bl-indemn',
        chapitre: '62',
        article: '621',
        initialAllocationFcfa: 500_000,
        committedFcfa: 100_000,
      },
    });

    expect(state.items).toHaveLength(2);
    expect(state.excludedActors).toHaveLength(1);
    expect(state.excludedActors[0]?.userId).toBe('u-absent');

    // Président: 50000 + 5000*(2-1) = 55000 brut, retenue 11% = 6050, net = 48950
    const pres = state.items.find((i) => i.roleCode === 'CPM_PRESIDENT');
    expect(pres?.grossAmountFcfa).toBe(55_000);
    expect(pres?.withholdingFcfa).toBe(6_050);
    expect(pres?.netAmountFcfa).toBe(48_950);

    // SIGAMP: 35000 + 2500*(1) + 1000*(4) = 41500
    const sigamp = state.items.find((i) => i.roleCode === 'SIGAMP');
    expect(sigamp?.grossAmountFcfa).toBe(41_500);

    expect(state.totalGrossFcfa).toBe(96_500);
    expect(state.isBudgetSufficient).toBe(true);
    expect(state.canSubmitForVisaCf).toBe(true);
  });
});

describe('Moteur 4 : exceptionsEngine.ts (Plafond 30% Avenants, Mise en Demeure & Résiliation)', () => {
  it('bloque un avenant dépassant 30% sans dérogation ACMP/MINMAP', () => {
    const blocked = evaluateAmendment({
      initialContractAmountHt: 100_000_000,
      previousApprovedAmendmentsDeltaHt: 20_000_000,
      proposedAmendmentDeltaHt: 15_000_000, // cumul = 35% > 30%
      hasCpmOrCccmOpinion: true,
      cpmOrCccmOpinionRef: 'AVIS-CCCM-012',
      hasBudgetaryCommitment: true,
    });
    expect(blocked.cumulativePercentage).toBe(35);
    expect(blocked.exceeds30PercentCap).toBe(true);
    expect(blocked.canValidateStandard).toBe(false);
    expect(blocked.canSignOrExecute).toBe(false);
    expect(blocked.requiredWorkflowRoute).toBe('DEROGATION_EXCEPTIONNELLE_ACMP_MINMAP');

    const unblocked = evaluateAmendment({
      initialContractAmountHt: 100_000_000,
      previousApprovedAmendmentsDeltaHt: 20_000_000,
      proposedAmendmentDeltaHt: 15_000_000,
      hasCpmOrCccmOpinion: true,
      cpmOrCccmOpinionRef: 'AVIS-CCCM-012',
      hasBudgetaryCommitment: true,
      minmapDerogationRef: 'DEROG-MINMAP-2026-088',
    });
    expect(unblocked.canSignOrExecute).toBe(true);
  });

  it('gère le chronomètre de mise en demeure (15 à 21 jours) et liquide la résiliation pour faute', () => {
    expect(() =>
      evaluateMiseEnDemeure({
        notifiedAt: new Date('2026-06-01T00:00:00Z'),
        gracePeriodDays: 10, // invalide < 15
        evaluationDate: new Date('2026-06-20T00:00:00Z'),
        remediedBySupplier: false,
      })
    ).toThrow();

    const expired = evaluateMiseEnDemeure({
      notifiedAt: new Date('2026-06-01T00:00:00Z'),
      gracePeriodDays: 15,
      evaluationDate: new Date('2026-06-20T00:00:00Z'),
      remediedBySupplier: false,
    });
    expect(expired.isExpired).toBe(true);
    expect(expired.eligibleForFaultTermination).toBe(true);

    const liq = calculateFaultTerminationLiquidation({
      contractInitialAmountTtc: 100_000_000,
      executedAndAcceptedTtc: 30_000_000,
      alreadyPaidToSupplierTtc: 25_000_000, // solde travaux dus = 5 000 000
      unamortizedStartAdvanceFcfa: 12_000_000,
      accruedDelayPenaltiesFcfa: 14_000_000, // doit être plafonné à 10 000 000 (10%)
      performanceBondAmountFcfa: 5_000_000,
      miseEnDemeureStatus: expired,
    });

    expect(liq.cappedDelayPenaltiesFcfa).toBe(10_000_000);
    // Créance admin = 12M + 10M = 22M ; crédits titulaire = 5M ; caution saisie = 5M -> dette nette = 12M
    expect(liq.netDebtOwedBySupplierFcfa).toBe(12_000_000);
    expect(liq.requiresArmpSanctionReferral).toBe(true);
  });
});
