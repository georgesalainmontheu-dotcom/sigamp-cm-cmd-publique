import type { EntityType, ProcurementNature } from '../../types/domain';
import {
  evaluateAddendumExtension,
  routeProcurementProcedure,
  type ProcurementRoutingResult,
} from './procurementRouter';
import type { BpuDqeLineItem, ProjectSector } from './technicalAdvisorEngine';

export interface RegulatoryDaoParams {
  offerValidityDays: number;
  standstillBusinessDays: number;
  tvaRate: number;
  irRealRate: number;
  irSimplifiedRate: number;
  guaranteeRetentionRate: number;
  bidBondRate: number;
  performanceBondRate: number;
  addendumMinNoticeDays: number;
}

export const DEFAULT_REGULATORY_DAO_PARAMS: RegulatoryDaoParams = {
  offerValidityDays: 90,
  standstillBusinessDays: 5,
  tvaRate: 0.1925,
  irRealRate: 0.022,
  irSimplifiedRate: 0.055,
  guaranteeRetentionRate: 0.1,
  bidBondRate: 0.02,
  performanceBondRate: 0.05,
  addendumMinNoticeDays: 7,
};

export interface DaoAdaptationPoint {
  id: string;
  pieceKey: 'PIECE_2_RPAO' | 'PIECE_3_CCAP' | 'PIECE_4_CCTP';
  label: string;
  placeholder: string;
  value: string;
  required: boolean;
}

export interface DaoPieceSection {
  pieceKey:
    | 'PIECE_1_AAO_BILINGUE'
    | 'PIECE_2_RPAO'
    | 'PIECE_3_CCAP'
    | 'PIECE_4_CCTP'
    | 'PIECE_5_BPU_DQE'
    | 'PIECE_6_MODELES_OHADA';
  title: string;
  lockedLegalPct: number;
  contentFr: string;
  contentEn?: string;
}

export interface DaoAssemblyInput {
  entityName: string;
  entityType: EntityType;
  city: string;
  daoNumber: string;
  projectCode: string;
  projectTitle: string;
  nature: ProcurementNature;
  sector: ProjectSector;
  locationLabel: string;
  fundingSource: string;
  budgetImputation: string;
  estimatedAmountTtc: number;
  executionDurationDays: number;
  submissionDeadlineIso: string;
  openingDatetimeIso: string;
  daoPurchasePriceFcfa?: number;
  cctpTitle: string;
  cctpTechnicalSpecs: string;
  cctpNorms: string[];
  bpuDqeLines: BpuDqeLineItem[];
  regulatoryParams?: Partial<RegulatoryDaoParams>;
  userAdaptations?: Record<string, string>;
}

export interface AssembledDaoResult {
  daoNumber: string;
  templateCode: string;
  routing: ProcurementRoutingResult;
  regulatoryParams: RegulatoryDaoParams;
  bidBondAmountFcfa: number;
  pieces: DaoPieceSection[];
  bpuBlankRows: Array<{
    itemCode: string;
    designation: string;
    unit: string;
    quantity: number;
    unitPriceBlank: string;
    totalBlank: string;
  }>;
  adaptationPoints: DaoAdaptationPoint[];
  completionMetrics: {
    autoAssembledPct: number;
    userAdaptationPct: number;
    completedAdaptationsCount: number;
    totalAdaptationsCount: number;
    overallReadinessPct: number;
  };
  addendumNotice?: {
    extended: boolean;
    newDeadlineIso: string;
    reason: string;
  };
}

function defaultAdaptationSchema(
  nature: ProcurementNature,
  userValues: Record<string, string> = {}
): DaoAdaptationPoint[] {
  if (nature === 'FOURNITURES') {
    return [
      {
        id: 'delivery_schedule',
        pieceKey: 'PIECE_3_CCAP',
        label: 'Lieu et modalités exactes de livraison / réception technique',
        placeholder: 'Ex: Magasin municipal de Bafang, livraison franco de port avec tests de mise en service.',
        value: userValues.delivery_schedule ?? '',
        required: true,
      },
      {
        id: 'manufacturer_auth',
        pieceKey: 'PIECE_2_RPAO',
        label: 'Autorisation du fabricant & garantie constructeur exigée',
        placeholder: 'Ex: Certificat d’origine et garantie minimale de 24 mois pièces et main-d’œuvre.',
        value: userValues.manufacturer_auth ?? '',
        required: true,
      },
    ];
  }
  if (nature === 'PRESTATIONS_INTELLECTUELLES') {
    return [
      {
        id: 'methodology_weight',
        pieceKey: 'PIECE_2_RPAO',
        label: 'Barème de pondération technique (Méthodologie vs Experts clés)',
        placeholder: 'Ex: Compréhension TDR 20 pts, Méthodologie 40 pts, Qualification Experts 40 pts (Seuil 75/100).',
        value: userValues.methodology_weight ?? '',
        required: true,
      },
      {
        id: 'experts_cv',
        pieceKey: 'PIECE_2_RPAO',
        label: 'Profils et diplômes des experts clés exigés',
        placeholder: 'Ex: Chef de mission Bac+5 Génie Civil (10 ans d’expérience) + Expert Environnementaliste.',
        value: userValues.experts_cv ?? '',
        required: true,
      },
    ];
  }
  return [
    {
      id: 'key_personnel',
      pieceKey: 'PIECE_2_RPAO',
      label: 'Qualification spécifique du personnel clé de chantier',
      placeholder: 'Ex: 1 Conducteur des travaux Ingénieur Génie Civil (5 ans min.), 1 Chef de chantier Technicien Supérieur.',
      value: userValues.key_personnel ?? '',
      required: true,
    },
    {
      id: 'min_equipment',
      pieceKey: 'PIECE_2_RPAO',
      label: 'Liste du matériel minimal propre ou en location exigé',
      placeholder: 'Ex: 1 bétonnière 350L, 1 camion benne 10T, 1 compacteur vibrant, 1 aiguille vibrante.',
      value: userValues.min_equipment ?? '',
      required: true,
    },
    {
      id: 'specific_turnover',
      pieceKey: 'PIECE_2_RPAO',
      label: 'Chiffre d’affaires minimum & références similaires (3 dernières années)',
      placeholder: 'Ex: Au moins 02 projets similaires exécutés et réceptionnés au cours des 3 dernières années.',
      value: userValues.specific_turnover ?? '',
      required: true,
    },
  ];
}

/**
 * Moteur d'Assemblage Automatique du DAO à 80% (Étape 3 - Zéro Feuille Blanche).
 * Fusionne le projet maturé, les règles CMP/fiscales actives, le CCTP et le BPU/DQE
 * sans jamais exposer les prix unitaires du Devis Confidentiel.
 */
export function assembleDaoFromProject(input: DaoAssemblyInput): AssembledDaoResult {
  const params: RegulatoryDaoParams = {
    ...DEFAULT_REGULATORY_DAO_PARAMS,
    ...input.regulatoryParams,
  };

  const routing = routeProcurementProcedure({
    entityType: input.entityType,
    nature: input.nature,
    estimatedAmountTtc: input.estimatedAmountTtc,
  });

  const templateCode =
    input.nature === 'TRAVAUX'
      ? 'DAO-TYPE-ARMP-TR-2026'
      : input.nature === 'FOURNITURES'
        ? 'DAO-TYPE-ARMP-AG-2026'
        : input.nature === 'SERVICES_QUANTIFIABLES'
          ? 'DAO-TYPE-ARMP-SPI-2026'
          : 'DAO-TYPE-ARMP-PI-2026';

  const bidBondAmountFcfa =
    input.nature === 'PRESTATIONS_INTELLECTUELLES'
      ? 0
      : Math.round(input.estimatedAmountTtc * params.bidBondRate);
  const daoPrice = input.daoPurchasePriceFcfa ?? (input.estimatedAmountTtc >= 50_000_000 ? 75_000 : 50_000);

  const adaptationPoints = defaultAdaptationSchema(input.nature, input.userAdaptations);
  const completedCount = adaptationPoints.filter((a) => a.value.trim().length > 0).length;
  const userPct =
    adaptationPoints.length > 0
      ? Math.round((completedCount / adaptationPoints.length) * 20)
      : 20;

  const deadlineDateFr = input.submissionDeadlineIso.slice(0, 10);
  const openingDateFr = input.openingDatetimeIso.slice(0, 10);

  const aaoFr = `AVIS D'APPEL D'OFFRES (${routing.recommendedMode}) N° ${input.daoNumber}
Maître d'Ouvrage : ${input.entityName} (${input.city})
Objet : ${input.projectTitle} (Code Projet : ${input.projectCode})
Lieu d'exécution : ${input.locationLabel}
Financement : ${input.fundingSource} — Imputation : ${input.budgetImputation}
Enveloppe prévisionnelle : ${input.estimatedAmountTtc.toLocaleString('fr-FR')} FCFA TTC
Délai d'exécution : ${input.executionDurationDays} jours calendaires
Commission compétente : ${routing.primaryCommission ?? 'Consultation directe'}${routing.requiresCccmPriorOpinion ? ` (Avis conforme ${routing.cccmOrgan})` : ''}
Acquisition du DAO : ${daoPrice.toLocaleString('fr-FR')} FCFA (Quittance Trésor / Recette)
Caution de soumission (OHADA) : ${bidBondAmountFcfa.toLocaleString('fr-FR')} FCFA (${(params.bidBondRate * 100).toFixed(1)}%)
Date limite de dépôt des offres : ${deadlineDateFr} à 13h00 précises au Secrétariat de la ${routing.primaryCommission ?? 'SIGAMP'}
Ouverture des plis : ${openingDateFr} à 14h00 en séance publique
Validité des offres : ${params.offerValidityDays} jours | Recours préalable : ${params.standstillBusinessDays} jours ouvrables.`;

  const aaoEn = `OPEN NATIONAL INVITATION TO TENDER (${routing.recommendedMode}) No. ${input.daoNumber}
Contracting Authority: ${input.entityName} (${input.city})
Subject: ${input.projectTitle} (Project Code: ${input.projectCode})
Location: ${input.locationLabel}
Funding Source: ${input.fundingSource} — Budget Line: ${input.budgetImputation}
Estimated Budget: ${input.estimatedAmountTtc.toLocaleString('en-US')} FCFA incl. VAT
Execution Period: ${input.executionDurationDays} calendar days
Competent Tenders Board: ${routing.primaryCommission ?? 'Direct Consultation'}${routing.requiresCccmPriorOpinion ? ` (Prior opinion ${routing.cccmOrgan})` : ''}
Tender File Fee: ${daoPrice.toLocaleString('en-US')} FCFA (Non-refundable receipt)
Bid Bond (OHADA Guarantee): ${bidBondAmountFcfa.toLocaleString('en-US')} FCFA (${(params.bidBondRate * 100).toFixed(1)}%)
Submission Deadline: ${deadlineDateFr} at 1:00 PM prompt
Bid Opening Session: ${openingDateFr} at 2:00 PM in public session
Bid Validity: ${params.offerValidityDays} days | Standstill / Appeal Period: ${params.standstillBusinessDays} working days.`;

  const adaptationsSummary = adaptationPoints
    .map(
      (ap) =>
        `- [ZONE D'ADAPTATION 20% : ${ap.label}] -> ${
          ap.value.trim() ? ap.value.trim() : `<< À COMPLÉTER : ${ap.placeholder} >>`
        }`
    )
    .join('\n');

  const rpaoFr = `RÈGLEMENT PARTICULIER DE L'APPEL D'OFFRES (RPAO) — Modèle ${templateCode}
1. Critères Éliminatoires Obligatoires (CMP Art. 96-104) :
   a) Absence ou non-validité de la caution de soumission de ${bidBondAmountFcfa.toLocaleString('fr-FR')} FCFA ;
   b) Absence ou expiration à la date d'ouverture de l'Attestation de Non-Redevance fiscale (DGI), Attestation CNPS, Attestation de Non-Faillite ou Inscription au fichier d'exclusion ARMP ;
   c) Fausse déclaration ou pièce falsifiée ;
   d) Note technique inférieure au seuil éliminatoire de 70/100 (ou 70% des sous-critères essentiels).
2. Durée de validité des offres : ${params.offerValidityDays} jours calendaires.
3. Détection des Offres Anormalement Basses (OAB) : référence pondérée 40% Devis Confidentiel / 60% moyenne des offres conformes (seuil -15%).
4. Points d'Adaptation Spécifiques (20% éditables) :
${adaptationsSummary}`;

  const ccapFr = `CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES (CCAP)
- Nature du contrat : ${routing.contractType} (${routing.recommendedMode}) — Délai : ${input.executionDurationDays} jours calendaires.
- Fiscalité camerounaise applicable (CGI) : TVA ${(params.tvaRate * 100).toFixed(2)}% retenue à la source ; Acompte IR ${(params.irRealRate * 100).toFixed(1)}% (Régime Réel avec attestation de non-redevance) ou ${(params.irSimplifiedRate * 100).toFixed(1)}% (Régime Simplifié/Défaut) ; TSR 15% pour non-résidents.
- Sûretés OHADA : Cautionnement définitif ${(params.performanceBondRate * 100).toFixed(1)}% dans les 20 jours ; Avance de démarrage max 20% couverte à 100% par caution ; Retenue de garantie ${(params.guaranteeRetentionRate * 100).toFixed(0)}%.
- Pénalités de retard (Art. 166 CMP) : 1/2000e par jour (J1-J30), puis 1/1000e (> J30), plafonnées à 10% du montant TTC.
- Réceptions & Garantie : Réception provisoire avec chronomètre de levée des réserves ; Réception définitive et mainlevée retenue après délai de garantie.`;

  const cctpFr = `CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES (CCTP) — ${input.cctpTitle}
Normes de référence : ${input.cctpNorms.length > 0 ? input.cctpNorms.join(', ') : 'Normes camerounaises ANOR / Eurocodes / Fascicules CCTG'}.

${input.cctpTechnicalSpecs}`;

  const bpuBlankRows = input.bpuDqeLines.map((line) => ({
    itemCode: line.itemCode,
    designation: line.designation,
    unit: line.unit,
    quantity: line.quantity,
    unitPriceBlank: '___________ FCFA',
    totalBlank: '___________ FCFA',
  }));

  const bpuText =
    bpuBlankRows.length > 0
      ? bpuBlankRows
          .map(
            (r) =>
              `${r.itemCode} | ${r.designation} | Unité: ${r.unit} | Qté: ${r.quantity} | PU HT: ${r.unitPriceBlank} | Total HT: ${r.totalBlank}`
          )
          .join('\n')
      : 'Cadre BPU/DQE en attente de postes validés à l’Étape 2.';

  const ohadaModelsFr = `MODÈLES TYPES OHADA & INTÉGRITÉ (PIÈCE 6)
1. Modèle de Lettre de Soumission (avec engagement ferme sur le délai de ${input.executionDurationDays} jours et validité ${params.offerValidityDays} jours).
2. Modèle de Caution Bancaire Autonome à Première Demande (Acte Uniforme OHADA Sûretés Art. 39-49 — Établissement agréé COBAC).
3. Charte d'Intégrité et Déclaration de Non-Conflit d'Intérêts (Circulaire ARMP/MINMAP).`;

  const pieces: DaoPieceSection[] = [
    {
      pieceKey: 'PIECE_1_AAO_BILINGUE',
      title: "Pièce 1 — Avis d'Appel d'Offres Bilingue (FR / EN)",
      lockedLegalPct: 100,
      contentFr: aaoFr,
      contentEn: aaoEn,
    },
    {
      pieceKey: 'PIECE_2_RPAO',
      title: "Pièce 2 — Règlement Particulier de l'Appel d'Offres (RPAO)",
      lockedLegalPct: 70,
      contentFr: rpaoFr,
    },
    {
      pieceKey: 'PIECE_3_CCAP',
      title: 'Pièce 3 — Cahier des Clauses Administratives Particulières (CCAP)',
      lockedLegalPct: 90,
      contentFr: ccapFr,
    },
    {
      pieceKey: 'PIECE_4_CCTP',
      title: 'Pièce 4 — Cahier des Clauses Techniques Particulières (CCTP injecté)',
      lockedLegalPct: 85,
      contentFr: cctpFr,
    },
    {
      pieceKey: 'PIECE_5_BPU_DQE',
      title: 'Pièce 5 — Cadre du BPU & DQE (Prix unitaires masqués)',
      lockedLegalPct: 100,
      contentFr: bpuText,
    },
    {
      pieceKey: 'PIECE_6_MODELES_OHADA',
      title: "Pièce 6 — Modèles de Soumission, Caution OHADA & Charte d'Intégrité",
      lockedLegalPct: 100,
      contentFr: ohadaModelsFr,
    },
  ];

  return {
    daoNumber: input.daoNumber,
    templateCode,
    routing,
    regulatoryParams: params,
    bidBondAmountFcfa,
    pieces,
    bpuBlankRows,
    adaptationPoints,
    completionMetrics: {
      autoAssembledPct: 80,
      userAdaptationPct: userPct,
      completedAdaptationsCount: completedCount,
      totalAdaptationsCount: adaptationPoints.length,
      overallReadinessPct: 80 + userPct,
    },
  };
}

export function applyAddendumToDao(
  dao: AssembledDaoResult,
  addendumDateIso: string,
  currentOpeningDateIso: string,
  isSubstantialModification: boolean
): AssembledDaoResult {
  const evalExt = evaluateAddendumExtension({
    currentSubmissionDeadline: new Date(currentOpeningDateIso),
    addendumIssuedAt: new Date(addendumDateIso),
    modifiesSubstantially: isSubstantialModification,
  });
  const newDeadlineIso = evalExt.newOpeningDate.toISOString();

  return {
    ...dao,
    addendumNotice: {
      extended: evalExt.extensionRequired,
      newDeadlineIso,
      reason: evalExt.reason ?? 'Délai maintenu (additif mineur >= 7 jours avant ouverture).',
    },
  };
}
