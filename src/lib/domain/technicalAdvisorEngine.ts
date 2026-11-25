import type { ProcurementNature } from '../../types/domain';
import { computeSha256Hex } from '../offline/offlineStore';

export type ProjectSector =
  | 'BATIMENT'
  | 'VRD_VOIRIE'
  | 'HYDRAULIQUE_ENERGIE'
  | 'EQUIPEMENTS_FOURNITURES'
  | 'TIC_LOGICIELS'
  | 'ETUDES_CONSEIL';

export type TechnicalAssignmentRole = 'INGENIEUR_MARCHE' | 'CHEF_SERVICE_MARCHE';

export interface TechnicalCandidateProfile {
  userId: string;
  fullName: string;
  administrativeTitle: string;
  currentRole: TechnicalAssignmentRole;
  specialtySectors: ProjectSector[];
  serviceOrigin: string;
  baseCity: string;
  activeContractsCount: number;
  maxParallelContracts?: number;
  yearsExperience?: number;
}

export interface TechnicalRecommendationInput {
  projectTitle: string;
  nature: ProcurementNature;
  sector: ProjectSector;
  projectCity: string;
  estimatedAmountTtc: number;
  candidates: TechnicalCandidateProfile[];
}

export interface ScoredTechnicalCandidate {
  candidate: TechnicalCandidateProfile;
  recommendedRole: TechnicalAssignmentRole;
  totalScore: number;
  breakdown: {
    sectorScore: number;     // max 40
    roleFitScore: number;    // max 25
    workloadScore: number;   // max 20
    proximityScore: number;  // max 15
  };
  rationale: string;
  isOverloaded: boolean;
}

export interface TechnicalRecommendationResult {
  recommendedRole: TechnicalAssignmentRole;
  topCandidates: ScoredTechnicalCandidate[];
  allScored: ScoredTechnicalCandidate[];
}

const ADJACENT_SECTORS: Record<ProjectSector, ProjectSector[]> = {
  BATIMENT: ['VRD_VOIRIE', 'HYDRAULIQUE_ENERGIE'],
  VRD_VOIRIE: ['BATIMENT', 'HYDRAULIQUE_ENERGIE'],
  HYDRAULIQUE_ENERGIE: ['BATIMENT', 'VRD_VOIRIE'],
  EQUIPEMENTS_FOURNITURES: ['TIC_LOGICIELS', 'HYDRAULIQUE_ENERGIE'],
  TIC_LOGICIELS: ['EQUIPEMENTS_FOURNITURES', 'ETUDES_CONSEIL'],
  ETUDES_CONSEIL: ['TIC_LOGICIELS', 'BATIMENT', 'VRD_VOIRIE'],
};

function determinePrimaryTechnicalRole(
  nature: ProcurementNature,
  sector: ProjectSector
): TechnicalAssignmentRole {
  if (
    nature === 'PRESTATIONS_INTELLECTUELLES' ||
    nature === 'SERVICES_QUANTIFIABLES' ||
    sector === 'ETUDES_CONSEIL'
  ) {
    return 'CHEF_SERVICE_MARCHE';
  }
  return 'INGENIEUR_MARCHE';
}

/**
 * Moteur de Recommandation Assistée de l'Ingénieur du Marché / Chef de Service (Étape 2)
 * Critères pondérés (/100) :
 * 1. Adéquation sectorielle (40 pts)
 * 2. Rôle statutaire adapté (25 pts)
 * 3. Plan de charge actif (20 pts)
 * 4. Proximité géographique (15 pts)
 */
export function recommendTechnicalAdvisors(
  input: TechnicalRecommendationInput
): TechnicalRecommendationResult {
  const targetRole = determinePrimaryTechnicalRole(input.nature, input.sector);
  const adjacent = ADJACENT_SECTORS[input.sector] ?? [];
  const normCity = input.projectCity.trim().toLowerCase();

  const allScored: ScoredTechnicalCandidate[] = input.candidates.map((candidate) => {
    let sectorScore = 10;
    if (candidate.specialtySectors.includes(input.sector)) {
      sectorScore = 40;
    } else if (candidate.specialtySectors.some((s) => adjacent.includes(s))) {
      sectorScore = 24;
    }

    const roleFitScore = candidate.currentRole === targetRole ? 25 : 14;

    const maxLoad = candidate.maxParallelContracts ?? 5;
    const isOverloaded = candidate.activeContractsCount >= maxLoad;
    const workloadScore = Math.max(0, 20 - candidate.activeContractsCount * 4);

    const candCity = candidate.baseCity.trim().toLowerCase();
    const proximityScore =
      candCity === normCity
        ? 15
        : candCity.includes(normCity) || normCity.includes(candCity)
          ? 11
          : 6;

    const totalScore = sectorScore + roleFitScore + workloadScore + proximityScore;

    const rationaleParts: string[] = [
      sectorScore === 40
        ? `Spécialité exacte (${input.sector})`
        : sectorScore === 24
          ? 'Spécialité technique connexe'
          : 'Profil technique polyvalent',
      candidate.currentRole === targetRole
        ? `Rôle adapté (${targetRole})`
        : `Mobilisable en ${targetRole}`,
      `Charge active : ${candidate.activeContractsCount}/${maxLoad} dossier(s)`,
      proximityScore === 15
        ? `Basé sur site (${candidate.baseCity})`
        : `Basé à ${candidate.baseCity}`,
    ];

    return {
      candidate,
      recommendedRole: targetRole,
      totalScore,
      breakdown: {
        sectorScore,
        roleFitScore,
        workloadScore,
        proximityScore,
      },
      rationale: rationaleParts.join(' · '),
      isOverloaded,
    };
  });

  allScored.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      a.candidate.activeContractsCount - b.candidate.activeContractsCount
  );

  return {
    recommendedRole: targetRole,
    topCandidates: allScored.slice(0, 3),
    allScored,
  };
}

export interface TechnicalSaisineInput {
  entityName: string;
  city: string;
  chronoNumber: string;
  dateFormatted: string;
  moTitle: string;
  moName: string;
  assigneeName: string;
  assigneeTitle: string;
  assignmentRole: TechnicalAssignmentRole;
  serviceOrigin: string;
  projectCode: string;
  projectTitle: string;
  sector: ProjectSector;
  estimatedAmountTtc: number;
  deadlineDays?: number;
}

export function generateTechnicalSaisineLetter(input: TechnicalSaisineInput): string {
  const roleLabel =
    input.assignmentRole === 'INGENIEUR_MARCHE'
      ? 'Ingénieur du Marché'
      : 'Chef de Service du Marché';
  const deadline = input.deadlineDays ?? 7;

  return `RÉPUBLIQUE DU CAMEROUN
Paix - Travail - Patrie
--------
${input.entityName.toUpperCase()}
--------
N° ${input.chronoNumber}

${input.city}, le ${input.dateFormatted}

${input.moTitle}
à
Monsieur/Madame ${input.assigneeName}
${input.assigneeTitle} (${input.serviceOrigin})

OBJET : Désignation en qualité de ${roleLabel} et saisine pour élaboration du CCTP, du cadre BPU/DQE et du Devis Confidentiel — Projet ${input.projectCode}.

Réf. : Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics (Art. 125-132).

Monsieur/Madame,

Suite à la validation du dossier de maturation du projet « ${input.projectTitle} » (Réf. ${input.projectCode}, secteur ${input.sector}, enveloppe prévisionnelle ${input.estimatedAmountTtc.toLocaleString(
    'fr-FR'
  )} FCFA TTC), j'ai l'honneur de vous notifier votre désignation en qualité de ${roleLabel}.

À ce titre, je vous invite à bien vouloir me transmettre sous un délai de ${deadline} jours calendaires :
1. Le Cahier des Clauses Techniques Particulières (CCTP) accompagné des plans/normes techniques applicables ;
2. Le cadre du Bordereau des Prix Unitaires (BPU) et du Devis Quantitatif et Estimatif (DQE) non chiffré destiné au Dossier d'Appel d'Offres ;
3. Sous pli strictement confidentiel et déposé dans le coffre sécurisé SIGAMP-CM, le Devis Confidentiel détaillé de l'Administration.

Je vous rappelle l'obligation absolue de confidentialité entourant le Devis Confidentiel jusqu'à la séance d'ouverture des offres financières par la Commission de Passation des Marchés.

Veuillez agréer l'assurance de ma considération distinguée.

${input.moTitle}
${input.moName}

Ampliations :
- SIGAMP / Chrono
- Archives / Dossier Technique`;
}

export interface BpuDqeLineItem {
  itemCode: string;
  designation: string;
  unit: string;
  quantity: number;
  confidentialUnitPriceHt: number;
}

export interface SealedConfidentialEstimate {
  estimateRef: string;
  totalHtFcfa: number;
  tvaFcfa: number;
  totalTtcFcfa: number;
  lineItems: Array<BpuDqeLineItem & { lineTotalHt: number }>;
  sealedSha256: string;
  sealedAtIso: string;
}

export async function sealConfidentialEstimate(input: {
  estimateRef: string;
  lineItems: BpuDqeLineItem[];
  tvaRate?: number;
}): Promise<SealedConfidentialEstimate> {
  const tvaRate = input.tvaRate ?? 0.1925;
  const computedLines = input.lineItems.map((item) => ({
    ...item,
    lineTotalHt: Math.round(item.quantity * item.confidentialUnitPriceHt),
  }));
  const totalHtFcfa = computedLines.reduce((acc, l) => acc + l.lineTotalHt, 0);
  const tvaFcfa = Math.round(totalHtFcfa * tvaRate);
  const totalTtcFcfa = totalHtFcfa + tvaFcfa;
  const sealedAtIso = new Date().toISOString();

  const payloadString = JSON.stringify({
    estimateRef: input.estimateRef,
    totalHtFcfa,
    tvaFcfa,
    totalTtcFcfa,
    computedLines,
    sealedAtIso,
  });

  const sealedSha256 = await computeSha256Hex(payloadString);

  return {
    estimateRef: input.estimateRef,
    totalHtFcfa,
    tvaFcfa,
    totalTtcFcfa,
    lineItems: computedLines,
    sealedSha256,
    sealedAtIso,
  };
}
