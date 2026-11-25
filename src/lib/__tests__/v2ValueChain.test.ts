import { describe, expect, it } from 'vitest';
import { executeAiToolCall } from '../ai/aiTools';
import {
  applyAddendumToDao,
  assembleDaoFromProject,
} from '../domain/daoAssemblerEngine';
import {
  detectAbnormallyLowBid,
  evaluateFinalReception,
  evaluateMaturationReadiness,
  evaluateProvisionalReception,
  type MaturationItemRecord,
} from '../domain/exceptionsEngine';
import {
  generateTechnicalSaisineLetter,
  recommendTechnicalAdvisors,
  sealConfidentialEstimate,
  type TechnicalCandidateProfile,
} from '../domain/technicalAdvisorEngine';
import {
  CAMEROON_LEGAL_CORPUS,
  searchLocalLegalCorpus,
} from '../legal/cameroonLegalCorpus';

describe('SIGAMP-CM V2.0 — Chaîne de Valeur Intégrale', () => {
  it('1. Maturation (Circulaire 001/CAB/PM) : bloque si une pièce obligatoire manque, débloque si valide ou dispense motivée', () => {
    const incomplete: MaturationItemRecord[] = [
      { pieceType: 'APS_APD', label: 'APS/APD', mandatory: true, status: 'VALIDE' },
      { pieceType: 'TDR', label: 'TDR', mandatory: true, status: 'VALIDE' },
      { pieceType: 'DISPONIBILITE_SITE', label: 'Site', mandatory: true, status: 'MANQUANT' },
      { pieceType: 'MERCURIALE_ESTIMATION', label: 'Mercuriale', mandatory: true, status: 'VALIDE' },
      {
        pieceType: 'EIES_NOTICE',
        label: 'EIES',
        mandatory: true,
        status: 'DISPENSE_JUSTIFIEE',
        dispensationReason: 'court', // < 10 caractères -> bloquant
      },
    ];

    const blocked = evaluateMaturationReadiness(incomplete);
    expect(blocked.canAdvanceToTechnicalAssignment).toBe(false);
    expect(blocked.blockingItems.length).toBe(2);

    const complete: MaturationItemRecord[] = [
      { pieceType: 'APS_APD', label: 'APS/APD', mandatory: true, status: 'VALIDE' },
      { pieceType: 'TDR', label: 'TDR', mandatory: true, status: 'VALIDE' },
      { pieceType: 'DISPONIBILITE_SITE', label: 'Site', mandatory: true, status: 'VALIDE' },
      { pieceType: 'MERCURIALE_ESTIMATION', label: 'Mercuriale', mandatory: true, status: 'VALIDE' },
      {
        pieceType: 'EIES_NOTICE',
        label: 'EIES',
        mandatory: true,
        status: 'DISPENSE_JUSTIFIEE',
        dispensationReason: 'Réhabilitation intérieure sans impact foncier ni rejets (Cat. C).',
      },
    ];

    const ready = evaluateMaturationReadiness(complete);
    expect(ready.canAdvanceToTechnicalAssignment).toBe(true);
    expect(ready.completionPct).toBe(100);
  });

  it('2. Désignation Ingénieur / Chef de Service, Saisine & Devis Confidentiel scellé SHA-256', async () => {
    const candidates: TechnicalCandidateProfile[] = [
      {
        userId: 'c1',
        fullName: 'Ing. Rodrigue Tchoumbou',
        administrativeTitle: 'Ingénieur GC',
        currentRole: 'INGENIEUR_MARCHE',
        specialtySectors: ['BATIMENT'],
        serviceOrigin: 'STM Bafang',
        baseCity: 'Bafang',
        activeContractsCount: 1,
      },
      {
        userId: 'c2',
        fullName: 'M. Bertrand Kamdem',
        administrativeTitle: 'Attaché TIC',
        currentRole: 'CHEF_SERVICE_MARCHE',
        specialtySectors: ['TIC_LOGICIELS', 'ETUDES_CONSEIL'],
        serviceOrigin: 'Service TIC',
        baseCity: 'Douala',
        activeContractsCount: 3,
      },
    ];

    const recoWorks = recommendTechnicalAdvisors({
      projectTitle: 'Construction marché',
      nature: 'TRAVAUX',
      sector: 'BATIMENT',
      projectCity: 'Bafang',
      estimatedAmountTtc: 120_000_000,
      candidates,
    });
    expect(recoWorks.recommendedRole).toBe('INGENIEUR_MARCHE');
    expect(recoWorks.topCandidates[0]?.candidate.userId).toBe('c1');
    expect(recoWorks.topCandidates[0]?.totalScore).toBeGreaterThan(85);

    const recoStudies = recommendTechnicalAdvisors({
      projectTitle: 'Audit SI',
      nature: 'PRESTATIONS_INTELLECTUELLES',
      sector: 'ETUDES_CONSEIL',
      projectCity: 'Douala',
      estimatedAmountTtc: 35_000_000,
      candidates,
    });
    expect(recoStudies.recommendedRole).toBe('CHEF_SERVICE_MARCHE');
    expect(recoStudies.topCandidates[0]?.candidate.userId).toBe('c2');

    const letter = generateTechnicalSaisineLetter({
      entityName: 'Commune de Bafang',
      city: 'Bafang',
      chronoNumber: '018/LS/CB/2026',
      dateFormatted: '23 novembre 2026',
      moTitle: 'Le Maire de la Commune de Bafang',
      moName: 'M. le Maire',
      assigneeName: 'Ing. Rodrigue Tchoumbou',
      assigneeTitle: 'Ingénieur GC',
      assignmentRole: 'INGENIEUR_MARCHE',
      serviceOrigin: 'STM Bafang',
      projectCode: 'BAF-2026-011',
      projectTitle: 'Construction marché',
      sector: 'BATIMENT',
      estimatedAmountTtc: 120_000_000,
    });
    expect(letter).toContain('018/LS/CB/2026');
    expect(letter).toContain('Devis Confidentiel');

    const sealed = await sealConfidentialEstimate({
      estimateRef: 'DEV-BAF-2026-011',
      lineItems: [
        {
          itemCode: '101',
          designation: 'Béton armé',
          unit: 'm3',
          quantity: 100,
          confidentialUnitPriceHt: 150_000,
        },
      ],
    });
    expect(sealed.totalHtFcfa).toBe(15_000_000);
    expect(sealed.tvaFcfa).toBe(2_887_500);
    expect(sealed.totalTtcFcfa).toBe(17_887_500);
    expect(sealed.sealedSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('3. Assemblage Automatique DAO 80%/20% : masque les prix confidentiels et proroge si additif < 7j', () => {
    const dao = assembleDaoFromProject({
      entityName: 'Commune de Bafang',
      entityType: 'COMMUNE',
      city: 'Bafang',
      daoNumber: '011/AONO/C-BAF/CDPM/2026',
      projectCode: 'BAF-2026-011',
      projectTitle: 'Construction Bloc Marchand',
      nature: 'TRAVAUX',
      sector: 'BATIMENT',
      locationLabel: 'Bafang Centre',
      fundingSource: 'FEICOM',
      budgetImputation: 'Chap 22 / Art 2210',
      estimatedAmountTtc: 120_000_000,
      executionDurationDays: 150,
      submissionDeadlineIso: '2026-11-20T13:00:00Z',
      openingDatetimeIso: '2026-11-20T14:00:00Z',
      cctpTitle: 'CCTP Gros Œuvre',
      cctpTechnicalSpecs: 'Béton dosé à 350 kg/m3.',
      cctpNorms: ['NC 234', 'Eurocode 2'],
      bpuDqeLines: [
        {
          itemCode: '101',
          designation: 'Béton armé semelles',
          unit: 'm3',
          quantity: 200,
          confidentialUnitPriceHt: 165_432,
        },
      ],
      userAdaptations: {
        key_personnel: 'Ingénieur GC 5 ans',
        min_equipment: 'Bétonnière 350L',
        specific_turnover: '150M FCFA',
      },
    });

    expect(dao.pieces).toHaveLength(6);
    expect(dao.pieces[0]?.contentEn).toContain('OPEN NATIONAL INVITATION TO TENDER');
    expect(dao.completionMetrics.autoAssembledPct).toBe(80);
    expect(dao.completionMetrics.overallReadinessPct).toBe(100);
    // Vérification stricte : le prix confidentiel unitaire NE DOIT JAMAIS apparaître dans le DAO
    const serializedDao = JSON.stringify(dao);
    expect(serializedDao).not.toContain('165432');
    expect(serializedDao).not.toContain('165 432');

    const withAddendum = applyAddendumToDao(
      dao,
      '2026-11-16T10:00:00Z',
      '2026-11-20T13:00:00Z',
      false
    );
    expect(withAddendum.addendumNotice?.extended).toBe(true);
  });

  it('4. Détection OAB (40% Devis Confidentiel + 60% Moyenne Offres) & Réceptions Provisoire/Définitive', () => {
    const oab = detectAbnormallyLowBid({
      confidentialEstimateTtc: 120_000_000,
      technicallyQualifiedBidsTtc: [
        { bidId: 'b1', supplierName: 'BTP EXPRESS', amountTtc: 118_000_000 },
        { bidId: 'b2', supplierName: 'LOW BIDDER SARL', amountTtc: 85_000_000 },
        { bidId: 'b3', supplierName: 'OUEST SA', amountTtc: 124_000_000 },
      ],
    });
    const flagged = oab.results.find((r) => r.bidId === 'b2');
    expect(flagged?.isAbnormallyLow).toBe(true);
    expect(flagged?.requiresPriceSubDetailsRequest).toBe(true);

    // Réception provisoire avec réserves -> bloque mainlevée caution bonne exécution
    const provWithReserves = evaluateProvisionalReception({
      receptionDateIso: '2026-11-23',
      warrantyDurationMonths: 12,
      hasReserves: true,
      reservesList: ['Etanchéité toiture'],
      reservesLiftDeadlineIso: '2026-12-15',
      reservesLiftedAtIso: null,
      attendanceSignedCount: 5,
      quorumRequiredCount: 4,
    });
    expect(provWithReserves.provisionalDecision).toBe('PRONONCEE_AVEC_RESERVES');
    expect(provWithReserves.canReleasePerformanceBond).toBe(false);
    expect(provWithReserves.warrantyEndDateIso).toBe('2027-11-23');

    // Réception définitive avant fin garantie -> bloquée
    const finalTooEarly = evaluateFinalReception({
      provisionalReceptionPronounced: true,
      reservesLifted: true,
      warrantyEndDateIso: '2027-11-23',
      evaluationDateIso: '2027-06-01',
      retentionGuaranteeTotalFcfa: 12_000_000,
      dgdNetBalanceFcfa: 10_000_000,
      attendanceSignedCount: 5,
      quorumRequiredCount: 4,
    });
    expect(finalTooEarly.eligibleForFinalReception).toBe(false);
    expect(finalTooEarly.canReleaseRetentionGuarantee).toBe(false);

    // Réception définitive après fin garantie & réserves levées -> libère les 10%
    const finalOk = evaluateFinalReception({
      provisionalReceptionPronounced: true,
      reservesLifted: true,
      warrantyEndDateIso: '2027-11-23',
      evaluationDateIso: '2027-11-25',
      retentionGuaranteeTotalFcfa: 12_000_000,
      dgdNetBalanceFcfa: 10_000_000,
      attendanceSignedCount: 5,
      quorumRequiredCount: 4,
    });
    expect(finalOk.eligibleForFinalReception).toBe(true);
    expect(finalOk.canReleaseRetentionGuarantee).toBe(true);
    expect(finalOk.retentionToReleaseFcfa).toBe(12_000_000);
    expect(finalOk.dgdLiquidationStatus).toBe('PRET_POUR_MANDATEMENT');
  });

  it('5. Corpus Juridique Camerounais RAG (24 articles) & Outil IA search_cameroon_legal_corpus', async () => {
    expect(CAMEROON_LEGAL_CORPUS.length).toBe(24);
    const maturationHits = searchLocalLegalCorpus('maturation aps apd mercuriale eies', {
      limit: 3,
    });
    expect(maturationHits[0]?.sourceCode).toBe('CIRC-001-CAB-PM');

    const toolRes = await executeAiToolCall(
      {
        id: 'tc-rag',
        name: 'search_cameroon_legal_corpus',
        arguments: { query: 'avenant 30% minmap' },
      },
      {
        entityId: '11111111-1111-4111-8111-111111111111',
        entityName: 'Commune de Bafang',
        entityType: 'COMMUNE',
        city: 'Bafang',
        fiscalYear: 2026,
        actorUserId: 'u1',
        actorRole: 'SIGAMP',
        actorTitle: 'Chef SIGAMP',
        actorName: 'M. SIGAMP',
      }
    );
    expect(toolRes.success).toBe(true);
    expect(toolRes.auditSummary).toContain('CMP-2018-366');
  });
});
