'use client';

import {
  AlertTriangle,
  Award,
  BookOpen,
  Building,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Gavel,
  HardHat,
  Lock,
  Printer,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  calculateAdjustedCompletionDate,
  calculateDecompte,
  type ServiceOrderTimelineEvent,
} from '../../lib/domain/billingEngine';
import {
  applyAddendumToDao,
  assembleDaoFromProject,
  DEFAULT_REGULATORY_DAO_PARAMS,
  type AssembledDaoResult,
} from '../../lib/domain/daoAssemblerEngine';
import {
  detectAbnormallyLowBid,
  evaluateAmendment,
  evaluateFinalReception,
  evaluateMaturationReadiness,
  evaluateMiseEnDemeure,
  evaluateProvisionalReception,
  evaluateSecuritiesExpiry,
  type MaturationItemRecord,
  type MaturationItemStatus,
} from '../../lib/domain/exceptionsEngine';
import {
  calculateIndemnityLiquidation,
  type SessionAttendanceRecord,
} from '../../lib/domain/indemnityEngine';
import {
  calculateLegalTimeline,
  routeProcurementProcedure,
} from '../../lib/domain/procurementRouter';
import {
  generateTechnicalSaisineLetter,
  recommendTechnicalAdvisors,
  sealConfidentialEstimate,
  type BpuDqeLineItem,
  type ProjectSector,
  type SealedConfidentialEstimate,
  type TechnicalCandidateProfile,
} from '../../lib/domain/technicalAdvisorEngine';
import { searchLocalLegalCorpus } from '../../lib/legal/cameroonLegalCorpus';
import { checkDisputeAdmissibility } from '../../lib/ai/disputeAnalyzer';
import {
  generateOfficialPdf,
  type GeneratedOfficialPdfResult,
} from '../../lib/pdf/pdfGenerator';
import {
  DEFAULT_DEMO_SCALES,
  type ActiveRoleProfile,
} from '../../lib/ui/demoProfiles';
import type { FiscalRegime, ProcurementNature } from '../../types/domain';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';
import { MaturationOrchestratorPanel } from './MaturationOrchestratorPanel';

const STAGE_DEFS = [
  { id: 1, short: '1. Maturation', title: 'Maturation & Géolocalisation (Circ. 001/CAB/PM)' },
  { id: 2, short: '2. Ingénieur & CCTP', title: 'Désignation Ingénieur, Saisine, CCTP & Devis Confidentiel' },
  { id: 3, short: '3. DAO 80/20', title: 'Assemblage Automatique DAO 80%/20% & Publicité' },
  { id: 4, short: '4. Passation & OAB', title: 'Ouverture, SCA Isolée, OAB, Attribution & Contentieux' },
  { id: 5, short: '5. Contrat & Visas', title: 'Contractualisation, Visas CF/Tutelle & Sûretés OHADA' },
  { id: 6, short: '6. Exécution & OS', title: 'OS Dynamiques, Décomptes Fiscaux, Avenants 30% & MED' },
  { id: 7, short: '7. Réceptions & DGD', title: 'Réceptions Provisoire/Définitive, Réserves & Clôture' },
] as const;

const TECHNICAL_CANDIDATES: TechnicalCandidateProfile[] = [
  {
    userId: 'tech-001',
    fullName: 'Ing. Rodrigue Tchoumbou',
    administrativeTitle: 'Ingénieur Principal de Génie Civil',
    currentRole: 'INGENIEUR_MARCHE',
    specialtySectors: ['BATIMENT', 'VRD_VOIRIE'],
    serviceOrigin: 'Services Techniques Municipaux — Bafang',
    baseCity: 'Bafang',
    activeContractsCount: 1,
    maxParallelContracts: 5,
    yearsExperience: 11,
  },
  {
    userId: 'tech-002',
    fullName: 'Ing. Clarisse Ngo Mbock',
    administrativeTitle: 'Ingénieur des Travaux Publics (DDTP Haut-Nkam)',
    currentRole: 'INGENIEUR_MARCHE',
    specialtySectors: ['VRD_VOIRIE', 'HYDRAULIQUE_ENERGIE', 'BATIMENT'],
    serviceOrigin: 'Délégation Départementale MINTP Haut-Nkam',
    baseCity: 'Bafang',
    activeContractsCount: 3,
    maxParallelContracts: 5,
    yearsExperience: 9,
  },
  {
    userId: 'tech-003',
    fullName: 'M. Bertrand Kamdem',
    administrativeTitle: 'Attaché d’Administration Principale — Expert TIC/Fournitures',
    currentRole: 'CHEF_SERVICE_MARCHE',
    specialtySectors: ['EQUIPEMENTS_FOURNITURES', 'TIC_LOGICIELS', 'ETUDES_CONSEIL'],
    serviceOrigin: 'Service Technique & Planification — Commune de Bafang',
    baseCity: 'Bafang',
    activeContractsCount: 1,
    maxParallelContracts: 5,
    yearsExperience: 8,
  },
  {
    userId: 'tech-004',
    fullName: 'Ing. Samuel Fotso',
    administrativeTitle: 'Ingénieur Génie Rural & Hydraulique',
    currentRole: 'INGENIEUR_MARCHE',
    specialtySectors: ['HYDRAULIQUE_ENERGIE'],
    serviceOrigin: 'Délégation Régionale MINEE — Ouest',
    baseCity: 'Bafoussam',
    activeContractsCount: 4,
    maxParallelContracts: 5,
    yearsExperience: 12,
  },
];

const INITIAL_MATURATION_ITEMS: MaturationItemRecord[] = [
  {
    pieceType: 'APS_APD',
    label: 'Études Techniques APS / APD validées',
    mandatory: true,
    status: 'VALIDE',
    documentRef: 'APD-CB-2026-011',
    validatedBy: 'DDMINTP Haut-Nkam',
    validatedAtIso: '2026-09-18',
  },
  {
    pieceType: 'TDR',
    label: 'Termes de Référence (TDR) ou Programme fonctionnel',
    mandatory: true,
    status: 'VALIDE',
    documentRef: 'TDR-CB-2026-011',
    validatedBy: 'Chef Service Technique',
    validatedAtIso: '2026-09-10',
  },
  {
    pieceType: 'DISPONIBILITE_SITE',
    label: 'Acte de disponibilité du site / Emprise foncière libre',
    mandatory: true,
    status: 'VALIDE',
    documentRef: 'ATT-FONC-044/PREF-HN',
    validatedBy: 'Préfet du Haut-Nkam',
    validatedAtIso: '2026-09-25',
  },
  {
    pieceType: 'MERCURIALE_ESTIMATION',
    label: 'Estimation confidentielle adossée à la Mercuriale MINCOMMERCE',
    mandatory: true,
    status: 'VALIDE',
    documentRef: 'MERC-2026-OUEST',
    validatedBy: 'SIGAMP / Contrôle Financier',
    validatedAtIso: '2026-10-02',
  },
  {
    pieceType: 'EIES_NOTICE',
    label: 'Notice d’Impact Environnemental et Social (EIES / MINEPDED)',
    mandatory: true,
    status: 'VALIDE',
    documentRef: 'CERT-ENV-2026-089',
    validatedBy: 'DDMINEPDED Haut-Nkam',
    validatedAtIso: '2026-10-05',
  },
];

const INITIAL_BPU_LINES: BpuDqeLineItem[] = [
  {
    itemCode: '101',
    designation: 'Installation de chantier, panneau réglementaire et études d’exécution',
    unit: 'FF',
    quantity: 1,
    confidentialUnitPriceHt: 4_500_000,
  },
  {
    itemCode: '201',
    designation: 'Terrassements généraux et fouilles en rigoles pour fondations',
    unit: 'm3',
    quantity: 650,
    confidentialUnitPriceHt: 7_200,
  },
  {
    itemCode: '301',
    designation: 'Béton armé dosé à 350 kg/m3 pour semelles, poteaux et chaînages',
    unit: 'm3',
    quantity: 210,
    confidentialUnitPriceHt: 165_000,
  },
  {
    itemCode: '401',
    designation: 'Maçonnerie en agglomérés creux 15x20x40 et enduits ciment',
    unit: 'm2',
    quantity: 1_850,
    confidentialUnitPriceHt: 14_500,
  },
  {
    itemCode: '501',
    designation: 'Charpente métallique IPN, couverture tôles bac 7/10e et VRD',
    unit: 'm2',
    quantity: 920,
    confidentialUnitPriceHt: 32_000,
  },
];

export function ValueChainWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [currentStage, setCurrentStage] = useState<number>(1);
  const [pdfResult, setPdfResult] = useState<GeneratedOfficialPdfResult | null>(null);
  const [ragOpen, setRagOpen] = useState(false);
  const [ragQuery, setRagQuery] = useState('maturation devis confidentiel reception');

  // --- ÉTAPE 1 : PROJET & MATURATION ---
  const [projectCode, setProjectCode] = useState('BAF-2026-011');
  const [projectTitle, setProjectTitle] = useState(
    'Construction du Bloc Marchand Moderne du Marché Central de Bafang (Phase 2)'
  );
  const [nature, setNature] = useState<ProcurementNature>('TRAVAUX');
  const [sector, setSector] = useState<ProjectSector>('BATIMENT');
  const [region, setRegion] = useState('Ouest');
  const [department, setDepartment] = useState('Haut-Nkam');
  const [arrondissement, setArrondissement] = useState('Bafang');
  const [gpsCoords, setGpsCoords] = useState('5.1572, 10.1774');
  const [fundingSource, setFundingSource] = useState('FEICOM / Budget Communal Bafang 2026');
  const [budgetImputation, setBudgetImputation] = useState('Chap. 22 / Art. 2210 / Par. 22101');
  const [estimatedAmountTtc, setEstimatedAmountTtc] = useState(120_000_000);
  const [executionDays, setExecutionDays] = useState(150);
  const [maturationItems, setMaturationItems] = useState<MaturationItemRecord[]>(
    INITIAL_MATURATION_ITEMS
  );

  // --- ÉTAPE 2 : INGÉNIEUR, SAISINE, CCTP & DEVIS CONFIDENTIEL ---
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('tech-001');
  const [saisineChrono, setSaisineChrono] = useState('018/LS/CB/MO/2026');
  const [saisinePreview, setSaisinePreview] = useState<string>('');
  const [cctpTitle, setCctpTitle] = useState(
    'Spécifications Techniques — Construction Hangars & Boutiques en Béton Armé'
  );
  const [cctpNorms, setCctpNorms] = useState('NC 234 (Ciment), Eurocode 2, DTU 21, Normes ANOR');
  const [cctpSpecs, setCctpSpecs] = useState(
    'Les fondations seront ancrées sur le bon sol à -1,40 m minimum après essai géotechnique. Béton de structure dosé à 350 kg/m3 avec ciment CPJ 42.5 certifié ANOR. Acier HA FeE500. Contrôles d’écrasement à 7 et 28 jours obligatoires aux frais de l’entrepreneur.'
  );
  const [bpuLines, setBpuLines] = useState<BpuDqeLineItem[]>(INITIAL_BPU_LINES);
  const [sealedEstimate, setSealedEstimate] = useState<SealedConfidentialEstimate | null>(null);
  const [confidentialUnlockedForOab, setConfidentialUnlockedForOab] = useState(false);

  // --- ÉTAPE 3 : DAO 80/20 & ADDITIFS ---
  const [daoNumber, setDaoNumber] = useState('011/AONO/C-BAF/CDPM/2026');
  const [pubDateIso, setPubDateIso] = useState('2026-10-15');
  const [daoAdaptations, setDaoAdaptations] = useState<Record<string, string>>({
    key_personnel:
      '1 Conducteur des travaux Ingénieur Génie Civil (5 ans exp. min.) + 1 Chef de chantier BTS BTP.',
    min_equipment:
      '1 bétonnière 350L, 1 camion benne 10T, 1 compacteur dame sauteuse, 2 aiguilles vibrantes.',
    specific_turnover:
      'Chiffre d’affaires cumulé des 3 derniers exercices >= 150 000 000 FCFA et 2 références similaires.',
  });
  const [addendumDateIso, setAddendumDateIso] = useState('2026-11-05');
  const [addendumSubstantial, setAddendumSubstantial] = useState(true);
  const [addendumApplied, setAddendumApplied] = useState(false);

  // --- ÉTAPE 4 : PASSATION, SCA, OAB, ATTRIBUTION & STANDSTILL ---
  const [openingDone, setOpeningDone] = useState(true);
  const [bidsTtc, setBidsTtc] = useState([
    { bidId: 'bid-1', supplierName: 'BTP EXPRESS SARL', amountTtc: 115_800_000, techScore: 84 },
    { bidId: 'bid-2', supplierName: 'ETS KEMGANG BTP SARL', amountTtc: 91_200_000, techScore: 78 },
    { bidId: 'bid-3', supplierName: 'CONSTRUCTIONS OUEST SA', amountTtc: 121_400_000, techScore: 88 },
  ]);
  const [awardPublishedIso, setAwardPublishedIso] = useState('2026-11-18');
  const [disputeFiledIso, setDisputeFiledIso] = useState('2026-11-21');
  const [disputePriorMo, setDisputePriorMo] = useState(true);

  // --- ÉTAPE 5 : CONTRACTUALISATION, VISAS & OHADA ---
  const [cfVisaRef, setCfVisaRef] = useState('VISA-CF-HN-2026-094');
  const [tutelleVisaRef, setTutelleVisaRef] = useState('APPROB-PREF-HN-2026-041');
  const [perfBondDaysLeft, setPerfBondDaysLeft] = useState(6);

  // --- ÉTAPE 6 : EXÉCUTION, OS, DÉCOMPTES & CAS SPÉCIAUX ---
  const [startOsDateIso, setStartOsDateIso] = useState('2026-06-01');
  const [stopDays] = useState(15);
  const [weatherExcusedDays, setWeatherExcusedDays] = useState(7);
  const [decompteGrossHt, setDecompteGrossHt] = useState(35_000_000);
  const [fiscalRegime, setFiscalRegime] = useState<FiscalRegime>('REEL');
  const [hasNonRedevance, setHasNonRedevance] = useState(true);
  const [delayDays, setDelayDays] = useState(12);
  const [proposedAmendmentHt, setProposedAmendmentHt] = useState(14_000_000);
  const [medNotifiedIso, setMedNotifiedIso] = useState('2026-11-01');
  const [medDays, setMedDays] = useState(15);

  // --- ÉTAPE 7 : RÉCEPTIONS & CLÔTURE ---
  const [provisionalDateIso, setProvisionalDateIso] = useState('2026-11-23');
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [hasReserves, setHasReserves] = useState(true);
  const [reservesListText, setReservesListText] = useState(
    '1) Reprise étanchéité noue bâtiment B ; 2) Pose 4 projecteurs LED solaires parvis.'
  );
  const [reservesLiftDeadlineIso, setReservesLiftDeadlineIso] = useState('2026-12-10');
  const [reservesLifted, setReservesLifted] = useState(false);
  const [finalEvalDateIso, setFinalEvalDateIso] = useState('2027-11-28');

  // === MOTEURS DÉTERMINISTES EN TEMPS RÉEL ===
  const routing = useMemo(
    () =>
      routeProcurementProcedure({
        entityType: profile.entityType,
        nature,
        estimatedAmountTtc: Math.max(100_000, estimatedAmountTtc),
      }),
    [profile.entityType, nature, estimatedAmountTtc]
  );

  const maturationReadiness = useMemo(
    () => evaluateMaturationReadiness(maturationItems),
    [maturationItems]
  );

  const advisorReco = useMemo(
    () =>
      recommendTechnicalAdvisors({
        projectTitle,
        nature,
        sector,
        projectCity: arrondissement,
        estimatedAmountTtc,
        candidates: TECHNICAL_CANDIDATES,
      }),
    [projectTitle, nature, sector, arrondissement, estimatedAmountTtc]
  );

  const selectedAdvisor = useMemo(
    () =>
      advisorReco.allScored.find((c) => c.candidate.userId === selectedAdvisorId) ??
      advisorReco.topCandidates[0]!,
    [advisorReco, selectedAdvisorId]
  );

  const liveEstimateTotals = useMemo(() => {
    const ht = bpuLines.reduce(
      (acc, l) => acc + Math.round(l.quantity * l.confidentialUnitPriceHt),
      0
    );
    const tva = Math.round(ht * 0.1925);
    return { ht, tva, ttc: ht + tva };
  }, [bpuLines]);

  const timeline = useMemo(() => {
    const pub = new Date(`${pubDateIso}T09:00:00Z`);
    if (Number.isNaN(pub.getTime())) return null;
    return calculateLegalTimeline({
      publicationDate: pub,
      mode: routing.recommendedMode,
    });
  }, [pubDateIso, routing.recommendedMode]);

  const assembledDao: AssembledDaoResult = useMemo(() => {
    const base = assembleDaoFromProject({
      entityName: profile.entityName,
      entityType: profile.entityType,
      city: arrondissement,
      daoNumber,
      projectCode,
      projectTitle,
      nature,
      sector,
      locationLabel: `${arrondissement}, Dépt. ${department}, Région ${region} (GPS: ${gpsCoords})`,
      fundingSource,
      budgetImputation,
      estimatedAmountTtc,
      executionDurationDays: executionDays,
      submissionDeadlineIso:
        timeline?.minSubmissionDeadline.toISOString() ?? '2026-11-09T13:00:00Z',
      openingDatetimeIso: timeline?.openingDate.toISOString() ?? '2026-11-09T14:00:00Z',
      cctpTitle,
      cctpTechnicalSpecs: cctpSpecs,
      cctpNorms: cctpNorms.split(',').map((s) => s.trim()).filter(Boolean),
      bpuDqeLines: bpuLines,
      userAdaptations: daoAdaptations,
    });

    if (addendumApplied && timeline) {
      return applyAddendumToDao(
        base,
        `${addendumDateIso}T10:00:00Z`,
        timeline.minSubmissionDeadline.toISOString(),
        addendumSubstantial
      );
    }
    return base;
  }, [
    profile.entityName,
    profile.entityType,
    arrondissement,
    daoNumber,
    projectCode,
    projectTitle,
    nature,
    sector,
    department,
    region,
    gpsCoords,
    fundingSource,
    budgetImputation,
    estimatedAmountTtc,
    executionDays,
    timeline,
    cctpTitle,
    cctpSpecs,
    cctpNorms,
    bpuLines,
    daoAdaptations,
    addendumApplied,
    addendumDateIso,
    addendumSubstantial,
  ]);

  const oabAnalysis = useMemo(
    () =>
      detectAbnormallyLowBid({
        confidentialEstimateTtc: sealedEstimate?.totalTtcFcfa ?? liveEstimateTotals.ttc,
        technicallyQualifiedBidsTtc: bidsTtc.map((b) => ({
          bidId: b.bidId,
          supplierName: b.supplierName,
          amountTtc: b.amountTtc,
        })),
      }),
    [sealedEstimate, liveEstimateTotals.ttc, bidsTtc]
  );

  const sessionIndemnities = useMemo(() => {
    const attendances: SessionAttendanceRecord[] = [
      {
        attendanceId: 'a1',
        userId: 'u-pres',
        fullName: 'Président CDPM Haut-Nkam',
        roleCode: 'CPM_PRESIDENT',
        isPresent: true,
      },
      {
        attendanceId: 'a2',
        userId: 'u-rap',
        fullName: 'Rapporteur SCA',
        roleCode: 'SCA_RAPPORTEUR',
        isPresent: true,
      },
      {
        attendanceId: 'a3',
        userId: 'u-armp',
        fullName: 'Observateur Indépendant ARMP',
        roleCode: 'ARMP_OBSERVATEUR',
        isPresent: true,
        distanceKm: 35,
      },
    ];
    return calculateIndemnityLiquidation({
      entityId: profile.entityId,
      fiscalYear: profile.fiscalYear,
      triggerEvent: 'OUVERTURE_PLIS',
      commissionType: routing.primaryCommission ?? 'CDPM',
      procurementMode: routing.recommendedMode,
      contractAmountTtc: estimatedAmountTtc,
      lotsCount: 1,
      bidsCount: bidsTtc.length,
      scales: DEFAULT_DEMO_SCALES,
      attendances,
      budgetLine: {
        budgetLineId: 'bl-ind-2026',
        chapitre: '62',
        article: '6210',
        initialAllocationFcfa: 8_000_000,
        committedFcfa: 1_500_000,
      },
    });
  }, [profile.entityId, profile.fiscalYear, routing, estimatedAmountTtc, bidsTtc.length]);

  const disputeCheck = useMemo(() => {
    try {
      return checkDisputeAdmissibility({
        stage: 'ATTRIBUTION',
        referenceEventAtIso: `${awardPublishedIso}T10:00:00Z`,
        filedAtIso: `${disputeFiledIso}T15:00:00Z`,
        priorMoSeizureVerified: disputePriorMo,
      });
    } catch {
      return null;
    }
  }, [awardPublishedIso, disputeFiledIso, disputePriorMo]);

  const ohadaReport = useMemo(() => {
    const today = new Date();
    const expIso = new Date(today.getTime() + perfBondDaysLeft * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return evaluateSecuritiesExpiry(
      [
        {
          id: 'sec-perf',
          contractOrBidRef: `M-${projectCode}`,
          supplierName: 'BTP EXPRESS SARL',
          securityType: 'CAUTION_BONNE_EXECUTION',
          issuerInstitution: 'Afriland First Bank',
          referenceNumber: 'AFB-OHADA-2026-441',
          amountFcfa: Math.round(
            estimatedAmountTtc * DEFAULT_REGULATORY_DAO_PARAMS.performanceBondRate
          ),
          expiryDateIso: expIso,
          ohadaFirstDemand: true,
        },
      ],
      today
    );
  }, [projectCode, estimatedAmountTtc, perfBondDaysLeft]);

  const registrationDuty = useMemo(() => {
    const rate = routing.contractType === 'MARCHE' ? 0.02 : 0.05;
    const baseHt = Math.round(estimatedAmountTtc / 1.1925);
    return {
      ratePct: rate * 100,
      amountFcfa: Math.round(baseHt * rate),
    };
  }, [routing.contractType, estimatedAmountTtc]);

  const osSchedule = useMemo(() => {
    const start = new Date(`${startOsDateIso}T08:00:00Z`);
    const stopDate = new Date(start.getTime() + 35 * 86_400_000).toISOString().slice(0, 10);
    const resumeDate = new Date(start.getTime() + (35 + stopDays) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const orders: ServiceOrderTimelineEvent[] = [
      { osNumber: 'OS-ARR-01', osType: 'ARRET', effectiveDateIso: stopDate },
      { osNumber: 'OS-REP-01', osType: 'REPRISE', effectiveDateIso: resumeDate },
      {
        osNumber: 'OS-INT-02',
        osType: 'TECHNIQUE',
        effectiveDateIso: resumeDate,
        weatherExcusedDays,
      },
    ];
    return calculateAdjustedCompletionDate({
      startOrderDateIso: startOsDateIso,
      initialDurationDays: executionDays,
      serviceOrders: orders,
      evaluationDateIso: new Date().toISOString().slice(0, 10),
    });
  }, [startOsDateIso, stopDays, weatherExcusedDays, executionDays]);

  const decomptePreview = useMemo(
    () =>
      calculateDecompte({
        contractType: routing.contractType,
        contractInitialAmountTtc: estimatedAmountTtc,
        grossAmountHt: decompteGrossHt,
        fiscalRegime,
        hasValidNonRedevance: hasNonRedevance,
        startAdvanceProrataRate: 0.2,
        hasReplacementGuaranteeBond: false,
        delayDays,
        weatherExcusedDays,
      }),
    [
      routing.contractType,
      estimatedAmountTtc,
      decompteGrossHt,
      fiscalRegime,
      hasNonRedevance,
      delayDays,
      weatherExcusedDays,
    ]
  );

  const amendmentCheck = useMemo(
    () =>
      evaluateAmendment({
        initialContractAmountHt: Math.round(estimatedAmountTtc / 1.1925),
        previousApprovedAmendmentsDeltaHt: 16_000_000,
        proposedAmendmentDeltaHt: proposedAmendmentHt,
        hasCpmOrCccmOpinion: true,
        cpmOrCccmOpinionRef: 'AVIS-CDPM-AV-01',
        hasBudgetaryCommitment: true,
      }),
    [estimatedAmountTtc, proposedAmendmentHt]
  );

  const medCheck = useMemo(() => {
    try {
      return evaluateMiseEnDemeure({
        notifiedAt: new Date(`${medNotifiedIso}T09:00:00Z`),
        gracePeriodDays: medDays,
        evaluationDate: new Date(),
        remediedBySupplier: false,
      });
    } catch {
      return null;
    }
  }, [medNotifiedIso, medDays]);

  const provisionalEval = useMemo(
    () =>
      evaluateProvisionalReception({
        receptionDateIso: provisionalDateIso,
        warrantyDurationMonths: warrantyMonths,
        hasReserves,
        reservesList: reservesListText
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean),
        reservesLiftDeadlineIso,
        reservesLiftedAtIso: reservesLifted ? new Date().toISOString().slice(0, 10) : null,
        attendanceSignedCount: 5,
        quorumRequiredCount: 4,
      }),
    [provisionalDateIso, warrantyMonths, hasReserves, reservesListText, reservesLiftDeadlineIso, reservesLifted]
  );

  const finalEval = useMemo(
    () =>
      evaluateFinalReception({
        provisionalReceptionPronounced: provisionalEval.canSignProvisionalPv,
        reservesLifted: !hasReserves || reservesLifted,
        warrantyEndDateIso: provisionalEval.warrantyEndDateIso,
        evaluationDateIso: finalEvalDateIso,
        retentionGuaranteeTotalFcfa: Math.round(estimatedAmountTtc * 0.1),
        dgdNetBalanceFcfa: decomptePreview.netPayableSupplierFcfa,
        attendanceSignedCount: 5,
        quorumRequiredCount: 4,
      }),
    [
      provisionalEval,
      hasReserves,
      reservesLifted,
      finalEvalDateIso,
      estimatedAmountTtc,
      decomptePreview.netPayableSupplierFcfa,
    ]
  );

  const ragResults = useMemo(
    () => searchLocalLegalCorpus(ragQuery, { limit: 5 }),
    [ragQuery]
  );

  const handleSealConfidentialEstimate = async () => {
    const sealed = await sealConfidentialEstimate({
      estimateRef: `DEV-CONF-${projectCode}`,
      lineItems: bpuLines,
    });
    setSealedEstimate(sealed);
  };

  const handleGenerateSaisine = () => {
    const text = generateTechnicalSaisineLetter({
      entityName: profile.entityName,
      city: arrondissement,
      chronoNumber: saisineChrono,
      dateFormatted: new Date().toLocaleDateString('fr-FR'),
      moTitle: profile.title,
      moName: profile.fullName,
      assigneeName: selectedAdvisor.candidate.fullName,
      assigneeTitle: selectedAdvisor.candidate.administrativeTitle,
      assignmentRole: selectedAdvisor.recommendedRole,
      serviceOrigin: selectedAdvisor.candidate.serviceOrigin,
      projectCode,
      projectTitle,
      sector,
      estimatedAmountTtc,
    });
    setSaisinePreview(text);
  };

  const handlePrintPdf = async (title: string, subtitle: string, paragraphs: string[]) => {
    const pdf = await generateOfficialPdf({
      documentType: title.includes('DAO') ? 'DAO' : 'CORRESPONDANCE',
      documentNumber: `${projectCode}/SIGAMP-V2/2026`,
      title,
      subtitle,
      entityId: profile.entityId,
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      city: arrondissement,
      projectCode,
      signatoryTitle: profile.title,
      signatoryName: profile.fullName,
      actorUserId: profile.userId,
      actorRole: profile.roleCode,
      recordTableName: 'projects',
      recordId: projectCode,
      paragraphs,
      ampliations: ['MINMAP', 'ARMP', 'Contrôleur Financier', 'Préfecture / Tutelle', 'Archives'],
    });
    setPdfResult(pdf);
  };

  const updateMaturationStatus = (pieceType: MaturationItemRecord['pieceType'], status: MaturationItemStatus) => {
    setMaturationItems((prev) =>
      prev.map((item) => (item.pieceType === pieceType ? { ...item, status } : item))
    );
  };

  return (
    <div className="space-y-5">
      {/* En-tête Chaîne de Valeur Intégrale V2.0 */}
      <div className="rounded-2xl border border-gov-gold/40 bg-gradient-to-r from-gov-navy via-gov-navy to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gov-gold/25 px-2.5 py-0.5 text-[11px] font-bold text-gov-gold">
                SIGAMP-CM V2.0 · CHAÎNE DE VALEUR INTÉGRALE
              </span>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
                {routing.contractType} · {routing.recommendedMode} · {routing.primaryCommission ?? 'DIRECT'}
              </span>
            </div>
            <h1 className="mt-2 text-lg font-bold">
              Dossier Pilote : {projectCode} — {projectTitle}
            </h1>
            <p className="mt-0.5 text-xs text-slate-300">
              {arrondissement} ({department}, {region}) · Enveloppe :{' '}
              <strong>{estimatedAmountTtc.toLocaleString('fr-FR')} FCFA TTC</strong> · Maturation :{' '}
              <strong>{maturationReadiness.completionPct}%</strong> · DAO :{' '}
              <strong>{assembledDao.completionMetrics.overallReadinessPct}% prêt</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRagOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-gov-gold/50 bg-gov-gold/15 px-3.5 py-2 text-xs font-semibold text-gov-gold transition hover:bg-gov-gold/25"
          >
            <BookOpen className="h-4 w-4" />
            {ragOpen ? 'Masquer Corpus Juridique RAG' : 'Corpus Juridique Camerounais (28 textes)'}
          </button>
        </div>

        {/* Stepper 7 Étapes Verrouillées */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {STAGE_DEFS.map((st) => {
            const locked = st.id >= 2 && !maturationReadiness.canAdvanceToTechnicalAssignment;
            const active = currentStage === st.id;
            return (
              <button
                key={st.id}
                type="button"
                disabled={locked}
                onClick={() => setCurrentStage(st.id)}
                className={`flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                  active
                    ? 'border-gov-gold bg-gov-gold text-slate-950 shadow'
                    : locked
                      ? 'cursor-not-allowed border-white/10 bg-white/5 text-slate-400 opacity-60'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <span className="truncate">{st.short}</span>
                {locked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 opacity-80" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tiroir Corpus Juridique RAG Hors-Ligne */}
      {ragOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Scale className="h-4 w-4 text-gov-gold" />
              Moteur RAG Juridique Local-First (8 Piliers du Droit Camerounais)
            </h2>
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                placeholder="Rechercher : maturation, oab, tva, 30%, ohada, reception..."
                className="w-full rounded-xl border border-slate-300 py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-2">
            {ragResults.map((chunk) => (
              <div
                key={chunk.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2 font-bold text-gov-navy">
                  <span>
                    {chunk.sourceCode} · {chunk.articleRef}
                  </span>
                  <span className="rounded bg-gov-navy/10 px-2 py-0.5 text-[10px]">
                    {chunk.domainTag} ({Math.round(chunk.similarity * 100)}%)
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-medium text-slate-700">{chunk.sourceTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{chunk.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 1 : MATURATION DÉTAILLÉE ==================== */}
      {currentStage === 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Building className="h-4 w-4 text-gov-gold" />
              Identité, Géolocalisation &amp; Imputation Budgétaire
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Code Projet</label>
                <input
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Secteur Technique</label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value as ProjectSector)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="BATIMENT">Bâtiment / Édifices</option>
                  <option value="VRD_VOIRIE">VRD / Voirie / Routes</option>
                  <option value="HYDRAULIQUE_ENERGIE">Hydraulique / Énergie</option>
                  <option value="EQUIPEMENTS_FOURNITURES">Équipements / Fournitures</option>
                  <option value="TIC_LOGICIELS">TIC / Logiciels</option>
                  <option value="ETUDES_CONSEIL">Études / Conseil</option>
                </select>
              </div>
            </div>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">Intitulé de l’Opération</label>
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Nature CMP</label>
                <select
                  value={nature}
                  onChange={(e) => setNature(e.target.value as ProcurementNature)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="TRAVAUX">TRAVAUX</option>
                  <option value="FOURNITURES">FOURNITURES</option>
                  <option value="SERVICES_QUANTIFIABLES">SERVICES_QUANTIFIABLES</option>
                  <option value="PRESTATIONS_INTELLECTUELLES">PRESTATIONS_INTELLECTUELLES</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600">Enveloppe TTC (FCFA)</label>
                <input
                  type="number"
                  value={estimatedAmountTtc}
                  onChange={(e) => setEstimatedAmountTtc(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Région</label>
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Département</label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Arrondissement</label>
                <input
                  value={arrondissement}
                  onChange={(e) => setArrondissement(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Coordonnées GPS</label>
                <input
                  value={gpsCoords}
                  onChange={(e) => setGpsCoords(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Délai prévu (jours)</label>
                <input
                  type="number"
                  value={executionDays}
                  onChange={(e) => setExecutionDays(Number(e.target.value) || 30)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">Source de financement &amp; Imputation</label>
              <input
                value={`${fundingSource} | ${budgetImputation}`}
                onChange={(e) => {
                  const [f, b] = e.target.value.split('|');
                  setFundingSource((f ?? '').trim());
                  if (b !== undefined) setBudgetImputation(b.trim());
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
                <ShieldCheck className="h-4 w-4 text-gov-gold" />
                Matrice de Maturation (Circulaire n° 001/CAB/PM &amp; MINEPAT)
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  maturationReadiness.canAdvanceToTechnicalAssignment
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {maturationReadiness.validatedCount}/{maturationReadiness.mandatoryCount} pièces validées ({maturationReadiness.completionPct}%)
              </span>
            </div>

            <div className="space-y-2.5">
              {maturationItems.map((item) => (
                <div
                  key={item.pieceType}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800">{item.label}</div>
                    <div className="text-[11px] text-slate-500">
                      Réf. : {item.documentRef ?? 'À renseigner'} · Visa : {item.validatedBy ?? 'En attente'}
                    </div>
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) =>
                      updateMaturationStatus(
                        item.pieceType,
                        e.target.value as MaturationItemStatus
                      )
                    }
                    className={`rounded-lg border px-2.5 py-1 font-semibold ${
                      item.status === 'VALIDE'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : item.status === 'MANQUANT'
                          ? 'border-rose-300 bg-rose-50 text-rose-800'
                          : 'border-amber-300 bg-amber-50 text-amber-800'
                    }`}
                  >
                    <option value="VALIDE">VALIDE</option>
                    <option value="EN_COURS">EN_COURS</option>
                    <option value="MANQUANT">MANQUANT (Bloquant)</option>
                    <option value="DISPENSE_JUSTIFIEE">DISPENSE_JUSTIFIEE</option>
                  </select>
                </div>
              ))}
            </div>

            {!maturationReadiness.canAdvanceToTechnicalAssignment ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
                <strong className="flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-rose-600" />
                  VERROU MATURATION ACTIF : Passage à l’Étape 2 bloqué
                </strong>
                <ul className="mt-1 list-disc pl-5">
                  {maturationReadiness.blockingItems.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <span>
                  Maturation conforme à la Circulaire n° 001/CAB/PM. Dossier éligible à la désignation de l’Ingénieur du Marché.
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentStage(2)}
                  className="rounded-xl bg-gov-navy px-4 py-2 font-semibold text-white hover:bg-gov-navyLight"
                >
                  Passer à l’Étape 2 : Ingénieur &amp; CCTP &rarr;
                </button>
              </div>
            )}
          </div>

          {/* MOTEUR D'ORCHESTRATION MATURATION -> DÉMARCHE -> SUIVI DES LIVRABLES */}
          <div className="lg:col-span-12">
            <MaturationOrchestratorPanel
              entityId={profile.entityId}
              entityType={profile.entityType}
              projectCode={projectCode}
              projectTitle={projectTitle}
              nature={nature}
              estimatedAmountTtc={estimatedAmountTtc}
            />
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 2 : INGÉNIEUR, SAISINE, CCTP & DEVIS CONFIDENTIEL ==================== */}
      {currentStage === 2 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Colonne gauche : Recommandation & Saisine */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <UserCheck className="h-4 w-4 text-gov-gold" />
              Recommandation Assistée ({advisorReco.recommendedRole})
            </h2>
            <p className="text-xs text-slate-600">
              Scoring pondéré /100 : Spécialité (40) · Rôle CMP (25) · Plan de charge (20) · Proximité (15).
            </p>
            <div className="space-y-2.5">
              {advisorReco.topCandidates.map((cand, idx) => {
                const selected = cand.candidate.userId === selectedAdvisor.candidate.userId;
                return (
                  <button
                    key={cand.candidate.userId}
                    type="button"
                    onClick={() => setSelectedAdvisorId(cand.candidate.userId)}
                    className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                      selected
                        ? 'border-gov-navy bg-gov-navy/5 ring-2 ring-gov-navy/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-gov-navy">
                        #{idx + 1} · {cand.candidate.fullName}
                      </span>
                      <span className="rounded-full bg-gov-gold/20 px-2 py-0.5 font-mono font-bold text-gov-navy">
                        {cand.totalScore}/100
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      {cand.candidate.administrativeTitle}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{cand.rationale}</div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
              <div className="flex items-center gap-2">
                <input
                  value={saisineChrono}
                  onChange={(e) => setSaisineChrono(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
                <button
                  type="button"
                  onClick={handleGenerateSaisine}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gov-navy px-3 py-2 font-semibold text-white"
                >
                  <Sparkles className="h-3.5 w-3.5 text-gov-gold" />
                  Générer Lettre de Saisine
                </button>
              </div>
              {saisinePreview && (
                <div className="space-y-2">
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-serif text-[11px] text-slate-800">
                    {saisinePreview}
                  </pre>
                  <button
                    type="button"
                    onClick={() =>
                      void handlePrintPdf(
                        'LETTRE DE SAISINE TECHNIQUE',
                        `Désignation ${selectedAdvisor.recommendedRole}`,
                        saisinePreview.split('\n\n')
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gov-navy px-3 py-1.5 text-xs font-semibold text-gov-navy"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Exporter PDF + QR
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Colonne droite : CCTP + BPU/DQE + Devis Confidentiel Chiffré/Isolé */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <FileText className="h-4 w-4 text-gov-gold" />
              CCTP, Cadre BPU/DQE &amp; Devis Confidentiel Isolé (RLS)
            </h2>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div>
                <label className="font-semibold text-slate-600">Titre du CCTP</label>
                <input
                  value={cctpTitle}
                  onChange={(e) => setCctpTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Normes applicables</label>
                <input
                  value={cctpNorms}
                  onChange={(e) => setCctpNorms(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">Prescriptions Techniques (CCTP)</label>
              <textarea
                rows={3}
                value={cctpSpecs}
                onChange={(e) => setCctpSpecs(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[11px] uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Désignation (injectée dans le DAO)</th>
                    <th className="px-3 py-2">U</th>
                    <th className="px-3 py-2">Qté</th>
                    <th className="px-3 py-2">PU Confidentiel HT</th>
                    <th className="px-3 py-2">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {bpuLines.map((line, idx) => (
                    <tr key={line.itemCode}>
                      <td className="px-3 py-2 font-mono font-bold">{line.itemCode}</td>
                      <td className="px-3 py-2">{line.designation}</td>
                      <td className="px-3 py-2">{line.unit}</td>
                      <td className="px-3 py-2 font-mono">{line.quantity}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={line.confidentialUnitPriceHt}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setBpuLines((prev) =>
                              prev.map((p, i) =>
                                i === idx ? { ...p, confidentialUnitPriceHt: val } : p
                              )
                            );
                          }}
                          className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-right"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold">
                        {(line.quantity * line.confidentialUnitPriceHt).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs">
              <div>
                <div className="font-bold text-amber-950">
                  Total Devis Confidentiel : {liveEstimateTotals.ht.toLocaleString('fr-FR')} FCFA HT ·{' '}
                  {liveEstimateTotals.ttc.toLocaleString('fr-FR')} FCFA TTC
                </div>
                <div className="text-[11px] text-amber-800">
                  Isolation stricte (RLS `confidential_estimates`) : invisible à la CPM, à la SCA et aux soumissionnaires avant l’ouverture financière.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleSealConfidentialEstimate()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 font-semibold text-white hover:bg-amber-800"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Sceller Devis Confidentiel (SHA-256)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStage(3)}
                  className="rounded-xl bg-gov-navy px-4 py-2 font-semibold text-white"
                >
                  Étape 3 : Assembler DAO 80/20 &rarr;
                </button>
              </div>
            </div>

            {sealedEstimate && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 font-mono text-[11px] text-emerald-900">
                Scellé SHA-256 : {sealedEstimate.sealedSha256} ({sealedEstimate.totalTtcFcfa.toLocaleString('fr-FR')} FCFA TTC)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 3 : ASSEMBLAGE DAO 80% / 20% ==================== */}
      {currentStage === 3 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
                <Sparkles className="h-4 w-4 text-gov-gold" />
                Zones d’Adaptation (20%) &amp; Additifs
              </h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                {assembledDao.completionMetrics.autoAssembledPct}% Auto +{' '}
                {assembledDao.completionMetrics.userAdaptationPct}% Adapté ={' '}
                {assembledDao.completionMetrics.overallReadinessPct}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="font-semibold text-slate-600">N° DAO</label>
                <input
                  value={daoNumber}
                  onChange={(e) => setDaoNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Date Publication AAO</label>
                <input
                  type="date"
                  value={pubDateIso}
                  onChange={(e) => setPubDateIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="space-y-3">
              {assembledDao.adaptationPoints.map((ap) => (
                <div key={ap.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
                  <label className="font-bold text-amber-950">
                    [{ap.pieceKey}] {ap.label}
                  </label>
                  <textarea
                    rows={2}
                    value={daoAdaptations[ap.id] ?? ''}
                    placeholder={ap.placeholder}
                    onChange={(e) =>
                      setDaoAdaptations((prev) => ({ ...prev, [ap.id]: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs"
                  />
                </div>
              ))}
            </div>

            {/* Simulation Additif < 7 jours */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-bold text-gov-navy">Contrôle Additif &amp; Prorogation (Art. 86-90 CMP)</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={addendumDateIso}
                  onChange={(e) => setAddendumDateIso(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                />
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={addendumSubstantial}
                    onChange={(e) => setAddendumSubstantial(e.target.checked)}
                  />
                  Modification substantielle
                </label>
                <button
                  type="button"
                  onClick={() => setAddendumApplied((v) => !v)}
                  className="rounded-lg bg-gov-navy px-3 py-1 font-semibold text-white"
                >
                  {addendumApplied ? 'Retirer Additif' : 'Simuler Additif'}
                </button>
              </div>
              {assembledDao.addendumNotice && (
                <p className="mt-2 font-semibold text-amber-900">
                  {assembledDao.addendumNotice.reason} &rarr; Nouvelle limite :{' '}
                  {assembledDao.addendumNotice.newDeadlineIso.slice(0, 10)}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void handlePrintPdf(
                    `DOSSIER D'APPEL D'OFFRES N° ${assembledDao.daoNumber}`,
                    `Modèle ${assembledDao.templateCode} — Bilingue FR/EN`,
                    assembledDao.pieces.map((p) => `${p.title}\n${p.contentFr}`)
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-gov-navy px-3 py-2 text-xs font-semibold text-gov-navy"
              >
                <Printer className="h-4 w-4" />
                Exporter DAO Complet PDF + QR
              </button>
              <button
                type="button"
                onClick={() => setCurrentStage(4)}
                className="rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
              >
                Étape 4 : Ouverture &amp; SCA &rarr;
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <h2 className="text-sm font-bold text-gov-navy">
              Aperçu des 6 Pièces Assemblées Automatiquement (Devis Confidentiel masqué)
            </h2>
            {assembledDao.pieces.map((piece) => (
              <details
                key={piece.pieceKey}
                open={piece.pieceKey === 'PIECE_1_AAO_BILINGUE' || piece.pieceKey === 'PIECE_5_BPU_DQE'}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
              >
                <summary className="cursor-pointer font-bold text-gov-navy">
                  {piece.title} (Verrou légal : {piece.lockedLegalPct}%)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700">
                  {piece.contentFr}
                </pre>
                {piece.contentEn && (
                  <pre className="mt-2 whitespace-pre-wrap border-t border-slate-200 pt-2 font-sans text-[11px] leading-relaxed text-slate-600">
                    {piece.contentEn}
                  </pre>
                )}
              </details>
            ))}
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 4 : PASSATION, SCA ISOLÉE, OAB & CONTENTIEUX ==================== */}
      {currentStage === 4 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
                <Gavel className="h-4 w-4 text-gov-gold" />
                Ouverture des Plis, SCA Isolée &amp; Détection OAB
              </h2>
              <button
                type="button"
                onClick={() => setConfidentialUnlockedForOab((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
                  confidentialUnlockedForOab
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-100 text-amber-950'
                }`}
              >
                {confidentialUnlockedForOab ? (
                  <>
                    <Unlock className="h-3.5 w-3.5" />
                    Devis Confidentiel Déverrouillé (Phase Financière)
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    Déverrouiller Devis Confidentiel pour OAB
                  </>
                )}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between font-semibold text-gov-navy">
                <span>Séance d’ouverture &amp; Feuille de présence émargée</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={openingDone}
                    onChange={(e) => setOpeningDone(e.target.checked)}
                  />
                  PV Signé
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                Indemnités de séance générées automatiquement :{' '}
                <strong>{sessionIndemnities.totalGrossFcfa.toLocaleString('fr-FR')} FCFA bruts</strong>{' '}
                ({sessionIndemnities.items.length} membres émargés) · Visa CF éligible :{' '}
                <strong>{sessionIndemnities.canSubmitForVisaCf ? 'OUI' : 'NON'}</strong>.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold text-gov-navy">Offres Qualifiées Techniquement (&ge; 70/100)</div>
              {bidsTtc.map((bid, idx) => {
                const oab = oabAnalysis.results.find((r) => r.bidId === bid.bidId);
                return (
                  <div
                    key={bid.bidId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{bid.supplierName}</div>
                      <div className="text-[11px] text-slate-500">Note tech : {bid.techScore}/100</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={bid.amountTtc}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          setBidsTtc((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, amountTtc: val } : p))
                          );
                        }}
                        className="w-32 rounded border border-slate-300 px-2 py-1 text-right font-mono"
                      />
                      {confidentialUnlockedForOab && oab && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            oab.isAbnormallyLow
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {oab.isAbnormallyLow
                            ? `OAB (${oab.deviationFromReferencePct}%) — Sous-détails exigés`
                            : `Conforme (${oab.deviationFromReferencePct}%)`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {confidentialUnlockedForOab && (
              <div className="rounded-xl border border-gov-navy/20 bg-gov-navy/5 p-3 text-xs text-gov-navy">
                Référence pondérée OAB (40% Devis Confidentiel{' '}
                {oabAnalysis.confidentialEstimateTtc.toLocaleString('fr-FR')} + 60% Moyenne{' '}
                {oabAnalysis.bidsAverageTtc.toLocaleString('fr-FR')}) ={' '}
                <strong>{oabAnalysis.weightedReferenceTtc.toLocaleString('fr-FR')} FCFA</strong> · Seuil OAB (-15%) :{' '}
                <strong>{oabAnalysis.oabCutoffTtc.toLocaleString('fr-FR')} FCFA</strong>.
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Scale className="h-4 w-4 text-gov-gold" />
              Attribution, Standstill (5 Jours Ouvrables) &amp; Recours
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Date publication attribution</label>
                <input
                  type="date"
                  value={awardPublishedIso}
                  onChange={(e) => setAwardPublishedIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Date dépôt recours simulé</label>
                <input
                  type="date"
                  value={disputeFiledIso}
                  onChange={(e) => setDisputeFiledIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={disputePriorMo}
                onChange={(e) => setDisputePriorMo(e.target.checked)}
              />
              Saisine préalable du Maître d’Ouvrage vérifiée
            </label>

            {disputeCheck && (
              <div
                className={`rounded-xl border p-3 text-xs ${
                  disputeCheck.suspensionActive
                    ? 'border-rose-300 bg-rose-50 text-rose-950'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-950'
                }`}
              >
                <div className="font-bold">
                  Recevabilité : {disputeCheck.isAdmissible ? 'RECEVABLE' : 'IRRECEVABLE'} ·{' '}
                  {disputeCheck.isForeclosed ? 'FORCLUS' : 'DANS LES DÉLAIS'} ({disputeCheck.businessDaysElapsed}/5 j. ouvrables)
                </div>
                <div className="mt-1 text-[11px]">
                  Effet suspensif sur signature :{' '}
                  <strong>{disputeCheck.suspensionActive ? 'ACTIF (Contrat bloqué)' : 'INACTIF'}</strong>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStage(5)}
                className="rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
              >
                Étape 5 : Contractualisation &amp; Visas &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 5 : CONTRACTUALISATION, VISAS & OHADA ==================== */}
      {currentStage === 5 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <FileCheck2 className="h-4 w-4 text-gov-gold" />
              Visas CF / Tutelle CGCTD &amp; Droits d’Enregistrement
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Visa Contrôleur Financier</label>
                <input
                  value={cfVisaRef}
                  onChange={(e) => setCfVisaRef(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Visa Tutelle (Préfet / MINMAP)</label>
                <input
                  value={tutelleVisaRef}
                  onChange={(e) => setTutelleVisaRef(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
              <div className="font-bold text-gov-navy">Liquidation Fiscale d’Enregistrement (CGI)</div>
              <p className="mt-1 text-slate-700">
                Nature : <strong>{routing.contractType}</strong> &rarr; Taux applicable :{' '}
                <strong>{registrationDuty.ratePct}% sur montant HT</strong> ={' '}
                <strong className="font-mono text-gov-navy">
                  {registrationDuty.amountFcfa.toLocaleString('fr-FR')} FCFA
                </strong>
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <ShieldAlert className="h-4 w-4 text-gov-gold" />
              Sûretés OHADA &amp; Alertes d’Expiration (J-30 / J-15 / J-7)
            </h2>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">
                Jours restants avant expiration Caution de Bonne Exécution : {perfBondDaysLeft}j
              </label>
              <input
                type="range"
                min={-5}
                max={45}
                value={perfBondDaysLeft}
                onChange={(e) => setPerfBondDaysLeft(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
            {ohadaReport.alerts.length > 0 ? (
              ohadaReport.alerts.map((al) => (
                <div
                  key={al.securityId}
                  className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950"
                >
                  <div className="font-bold">
                    [{al.severity}] {al.referenceNumber} — {al.issuerInstitution} (J{al.daysRemaining >= 0 ? `-${al.daysRemaining}` : al.daysRemaining})
                  </div>
                  <p className="mt-1 text-[11px]">{al.recommendedAction}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Toutes les cautions OHADA sont valides au-delà de 30 jours.
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStage(6)}
                className="rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
              >
                Étape 6 : Exécution &amp; Décomptes &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 6 : EXÉCUTION, OS, DÉCOMPTES & CAS SPÉCIAUX ==================== */}
      {currentStage === 6 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <HardHat className="h-4 w-4 text-gov-gold" />
              Ordres de Service Dynamiques &amp; Décompte Fiscal (CGI)
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">OS Démarrage</label>
                <input
                  type="date"
                  value={startOsDateIso}
                  onChange={(e) => setStartOsDateIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Jours intempéries (OS)</label>
                <input
                  type="number"
                  value={weatherExcusedDays}
                  onChange={(e) => setWeatherExcusedDays(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              Date d’achèvement recalculée ({executionDays}j + {stopDays}j arrêt + {weatherExcusedDays}j intempéries) :{' '}
              <strong className="font-mono text-gov-navy">
                {osSchedule.revisedCompletionDateIso}
              </strong>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Brut HT Décompte</label>
                <input
                  type="number"
                  value={decompteGrossHt}
                  onChange={(e) => setDecompteGrossHt(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Régime CGI</label>
                <select
                  value={fiscalRegime}
                  onChange={(e) => setFiscalRegime(e.target.value as FiscalRegime)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                >
                  <option value="REEL">REEL (AIR 2,2%)</option>
                  <option value="SIMPLIFIE">SIMPLIFIE (AIR 5,5%)</option>
                  <option value="ETRANGER_NON_RESIDENT">NON-RÉSIDENT (TSR 15%)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-600">Retard brut (j)</label>
                <input
                  type="number"
                  value={delayDays}
                  onChange={(e) => setDelayDays(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={hasNonRedevance}
                onChange={(e) => setHasNonRedevance(e.target.checked)}
              />
              Attestation de Non-Redevance DGI valide
            </label>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
              <div>
                <span className="text-slate-600">Net Titulaire</span>
                <div className="font-mono font-bold text-emerald-900">
                  {decomptePreview.netPayableSupplierFcfa.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <span className="text-slate-600">Reversement Trésor</span>
                <div className="font-mono font-bold text-gov-navy">
                  {decomptePreview.treasuryReversementFcfa.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <span className="text-slate-600">Retenue Garantie 10%</span>
                <div className="font-mono font-bold text-slate-800">
                  {decomptePreview.guaranteeRetentionFcfa.toLocaleString('fr-FR')} F
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <AlertTriangle className="h-4 w-4 text-gov-gold" />
              Verrou Avenant (30%) &amp; Mise en Demeure (15–21j)
            </h2>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">
                Avenant proposé HT (Cumul antérieur : 16 000 000 FCFA)
              </label>
              <input
                type="number"
                value={proposedAmendmentHt}
                onChange={(e) => setProposedAmendmentHt(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
              />
            </div>
            <div
              className={`rounded-xl border p-3 text-xs ${
                amendmentCheck.exceeds30PercentCap
                  ? 'border-rose-300 bg-rose-50 text-rose-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              Cumul Avenants : <strong>{amendmentCheck.cumulativePercentage}%</strong> &rarr; Voie :{' '}
              <strong>{amendmentCheck.requiredWorkflowRoute}</strong>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Date Mise en Demeure</label>
                <input
                  type="date"
                  value={medNotifiedIso}
                  onChange={(e) => setMedNotifiedIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Délai légal (15–21j)</label>
                <input
                  type="number"
                  min={15}
                  max={21}
                  value={medDays}
                  onChange={(e) => setMedDays(Number(e.target.value) || 15)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            {medCheck && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                Échéance MED : <strong>{medCheck.deadlineDate.toISOString().slice(0, 10)}</strong> · Éligible résiliation / exclusion ARMP :{' '}
                <strong>{medCheck.eligibleForFaultTermination ? 'OUI (Délai expiré)' : `NON (${medCheck.daysRemaining}j restants)`}</strong>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStage(7)}
                className="rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
              >
                Étape 7 : Réceptions &amp; Clôture &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ÉTAPE 7 : RÉCEPTIONS PROVISOIRE & DÉFINITIVE, DGD & CLÔTURE ==================== */}
      {currentStage === 7 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <ClipboardCheck className="h-4 w-4 text-gov-gold" />
              Réception Provisoire &amp; Chronomètre de Levée des Réserves
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Date Réception Provisoire</label>
                <input
                  type="date"
                  value={provisionalDateIso}
                  onChange={(e) => setProvisionalDateIso(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Délai de Garantie (mois)</label>
                <input
                  type="number"
                  min={6}
                  max={24}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value) || 12)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={hasReserves}
                  onChange={(e) => setHasReserves(e.target.checked)}
                />
                Réserves techniques constatées
              </label>
              {hasReserves && (
                <label className="flex items-center gap-1.5 font-semibold text-emerald-800">
                  <input
                    type="checkbox"
                    checked={reservesLifted}
                    onChange={(e) => setReservesLifted(e.target.checked)}
                  />
                  PV de Levée des Réserves signé
                </label>
              )}
            </div>
            {hasReserves && (
              <div className="space-y-2 text-xs">
                <textarea
                  rows={2}
                  value={reservesListText}
                  onChange={(e) => setReservesListText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2"
                />
                <div>
                  <label className="font-semibold text-slate-600">Délai limite de levée</label>
                  <input
                    type="date"
                    value={reservesLiftDeadlineIso}
                    onChange={(e) => setReservesLiftDeadlineIso(e.target.value)}
                    className="ml-2 rounded border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
            )}
            <div
              className={`rounded-xl border p-3 text-xs ${
                provisionalEval.canReleasePerformanceBond
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              <div>
                Décision : <strong>{provisionalEval.provisionalDecision}</strong> · Fin de garantie :{' '}
                <strong>{provisionalEval.warrantyEndDateIso}</strong>
              </div>
              <div className="mt-1">
                Mainlevée Caution Bonne Exécution :{' '}
                <strong>
                  {provisionalEval.canReleasePerformanceBond
                    ? 'AUTORISÉE'
                    : 'BLOQUÉE jusqu’à levée des réserves'}
                </strong>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Award className="h-4 w-4 text-gov-gold" />
              Réception Définitive, Mainlevée 10% &amp; Clôture SHA-256
            </h2>
            <div className="text-xs">
              <label className="font-semibold text-slate-600">Date Commission Réception Définitive</label>
              <input
                type="date"
                value={finalEvalDateIso}
                onChange={(e) => setFinalEvalDateIso(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              />
            </div>

            {finalEval.eligibleForFinalReception ? (
              <div className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950">
                <div className="font-bold">
                  RÉCEPTION DÉFINITIVE ÉLIGIBLE — DGD {finalEval.dgdLiquidationStatus}
                </div>
                <div>
                  Mainlevée de la Retenue de Garantie (10%) :{' '}
                  <strong className="font-mono">
                    {finalEval.retentionToReleaseFcfa.toLocaleString('fr-FR')} FCFA
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handlePrintPdf(
                      `CERTIFICAT DE CLÔTURE & RÉCEPTION DÉFINITIVE — ${projectCode}`,
                      `Liquidation DGD & Mainlevée Retenue de Garantie 10%`,
                      [
                        `Opération : ${projectTitle} (${arrondissement}, ${department}).`,
                        `Réception provisoire : ${provisionalDateIso} (${provisionalEval.provisionalDecision}).`,
                        `Réception définitive prononcée le ${finalEvalDateIso} après expiration du délai de garantie (${warrantyMonths} mois).`,
                        `Mainlevée intégrale de la retenue de garantie (10%) : ${finalEval.retentionToReleaseFcfa.toLocaleString('fr-FR')} FCFA.`,
                      ]
                    )
                  }
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gov-navy px-4 py-2 font-semibold text-white"
                >
                  <Printer className="h-4 w-4 text-gov-gold" />
                  Générer PV Définitif &amp; Certificat Clôture SHA-256/QR
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950">
                <div className="font-bold">Réception Définitive &amp; Mainlevée 10% Bloquées :</div>
                <ul className="mt-1 list-disc pl-5">
                  {finalEval.blockingReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {pdfResult && (
        <PdfPreviewModal result={pdfResult} onClose={() => setPdfResult(null)} />
      )}
    </div>
  );
}
