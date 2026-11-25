import type { EntityType, RbacRole } from '../../types/domain';
import type { IndemnityScale } from '../domain/indemnityEngine';
import type { EntityLicenseStatus } from '../domain/licensingEngine';

export type WorkspaceSpaceId =
  | 'SIGAMP_MO'
  | 'CPM_SCA_ARMP'
  | 'FINANCE_CF'
  | 'CONTENTIEUX'
  | 'SOUMISSIONNAIRE';

export interface ActiveRoleProfile {
  spaceId: WorkspaceSpaceId;
  label: string;
  shortLabel: string;
  roleCode: RbacRole;
  userId: string;
  fullName: string;
  title: string;
  entityId: string;
  entityCode: string;
  entityName: string;
  entityType: EntityType;
  city: string;
  fiscalYear: number;
  description: string;
  quickAiPrompts: string[];
  isPlatformSuperAdmin?: boolean;
  isEntityAdmin?: boolean;
  licenseStatus?: EntityLicenseStatus;
  licensePlanCode?: string;
  licenseExpiresAt?: string | null;
  primaryColor?: string;
  accentColor?: string;
}

export const ROLE_PROFILES: ActiveRoleProfile[] = [
  {
    spaceId: 'SIGAMP_MO',
    label: 'Espace SIGAMP / Maître d’Ouvrage',
    shortLabel: 'SIGAMP / MO',
    roleCode: 'SIGAMP',
    userId: '10000000-0000-4000-8000-000000000001',
    fullName: 'Jean-Paul Kamdem',
    title: 'Le Chef du SIGAMP — Commune de Bafang',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityCode: 'CM-OU-BAF',
    entityName: 'Commune de Bafang',
    entityType: 'COMMUNE',
    city: 'Bafang',
    fiscalYear: 2026,
    description:
      'Journal des Projets, montage DAO, suivi des délais, avenants 30%, correspondances & indemnités.',
    quickAiPrompts: [
      'Crée un projet de travaux routiers BAF-2026-019 pour 75 000 000 FCFA TTC',
      'Calcule les pénalités pour un marché de 80M TTC avec 42 jours de retard dont 8 jours d’intempéries',
      'Génère un bordereau de transmission 041/BT/CB/2026 vers le Président de la CDPM du Haut-Nkam',
    ],
  },
  {
    spaceId: 'CPM_SCA_ARMP',
    label: 'Espace CPM / SCA / Observateur ARMP',
    shortLabel: 'CPM / SCA / ARMP',
    roleCode: 'CPM_PRESIDENT',
    userId: '10000000-0000-4000-8000-000000000002',
    fullName: 'Dr. Mireille Nguemo',
    title: 'Présidente de la CDPM du Haut-Nkam',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityCode: 'CM-OU-BAF',
    entityName: 'Commune de Bafang',
    entityType: 'COMMUNE',
    city: 'Bafang',
    fiscalYear: 2026,
    description:
      'Salle virtuelle d’ouverture, feuille de présence émargée, grille SCA isolée & détection OAB.',
    quickAiPrompts: [
      'Liquide les indemnités d’ouverture des plis CDPM pour 45M TTC sur 2 lots et 4 offres',
      'Vérifie les critères d’élimination pour une Offre Anormalement Basse',
    ],
  },
  {
    spaceId: 'FINANCE_CF',
    label: 'Espace Contrôleur Financier / Receveur',
    shortLabel: 'Contrôleur / Receveur',
    roleCode: 'CONTROLEUR_FINANCIER',
    userId: '10000000-0000-4000-8000-000000000003',
    fullName: 'Alphonse Tchoupo',
    title: 'Contrôleur Financier Spécialisé',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityCode: 'CM-OU-BAF',
    entityName: 'Commune de Bafang',
    entityType: 'COMMUNE',
    city: 'Bafang',
    fiscalYear: 2026,
    description:
      'File de visa budgétaire préalable, liquidation fiscale des décomptes (TVA/AIR/TSR) et états d’indemnités.',
    quickAiPrompts: [
      'Liquide un décompte de 25M HT sur un marché de 100M TTC au régime réel avec attestation de non-redevance',
      'Contrôle le plafond d’un avenant de 18M HT sur un contrat initial de 50M HT',
    ],
  },
  {
    spaceId: 'CONTENTIEUX',
    label: 'Espace Contentieux & Recours',
    shortLabel: 'Contentieux & ARMP',
    roleCode: 'MO_MOD',
    userId: '10000000-0000-4000-8000-000000000004',
    fullName: 'Me Clarisse Fotso',
    title: 'Directrice des Affaires Juridiques & Contentieux',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityCode: 'CM-OU-BAF',
    entityName: 'Commune de Bafang',
    entityType: 'COMMUNE',
    city: 'Bafang',
    fiscalYear: 2026,
    description:
      'Registre des saisines, alertes délais 5 jours ouvrables, verrouillage suspensif & audit IA ARMP.',
    quickAiPrompts: [
      'Vérifie si une mise en demeure de 18 jours notifiée le 2026-11-01 est expirée aujourd’hui',
      'Rappelle les conditions de l’effet suspensif sur la signature d’un marché public',
    ],
  },
  {
    spaceId: 'SOUMISSIONNAIRE',
    label: 'Portail Soumissionnaire',
    shortLabel: 'Soumissionnaire',
    roleCode: 'SOUMISSIONNAIRE',
    userId: '10000000-0000-4000-8000-000000000005',
    fullName: 'ETS KEMGANG BTP SARL',
    title: 'Soumissionnaire Agréé (NIU M041912345678A)',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityCode: 'CM-OU-BAF',
    entityName: 'Commune de Bafang',
    entityType: 'COMMUNE',
    city: 'Bafang',
    fiscalYear: 2026,
    description:
      'Consultation des AAO, soumission dématérialisée compressée, suivi des décomptes & dépôt de recours.',
    quickAiPrompts: [
      'Quelles pièces administratives expirent le plus souvent à l’ouverture des plis ?',
      'Quel est le délai légal pour déposer un recours après publication d’attribution ?',
    ],
  },
];

export const DEFAULT_DEMO_SCALES: IndemnityScale[] = [
  {
    id: 'scale-pres-ouv',
    entityId: null,
    fiscalYear: 2026,
    scaleName: 'Barème National — Président Commission (Ouverture)',
    legalReference: 'Décret Barèmes Commissions des Marchés',
    commissionType: null,
    roleCode: 'CPM_PRESIDENT',
    triggerEvent: 'OUVERTURE_PLIS',
    procurementMode: null,
    contractAmountMinFcfa: 0,
    contractAmountMaxFcfa: null,
    baseAmountFcfa: 50_000,
    perLotBonusFcfa: 10_000,
    perBidBonusFcfa: 0,
    dailyMissionAllowanceFcfa: 0,
    transportRatePerKmFcfa: 0,
    taxWithholdingRate: 0.11,
    sessionCapFcfa: 150_000,
    monthlyCapFcfa: 450_000,
    annualCapFcfa: 4_500_000,
    active: true,
  },
  {
    id: 'scale-membre-ouv',
    entityId: null,
    fiscalYear: 2026,
    scaleName: 'Barème National — Membre Commission (Ouverture)',
    legalReference: 'Décret Barèmes Commissions des Marchés',
    commissionType: null,
    roleCode: 'CPM_MEMBRE',
    triggerEvent: 'OUVERTURE_PLIS',
    procurementMode: null,
    contractAmountMinFcfa: 0,
    contractAmountMaxFcfa: null,
    baseAmountFcfa: 35_000,
    perLotBonusFcfa: 5_000,
    perBidBonusFcfa: 0,
    dailyMissionAllowanceFcfa: 0,
    transportRatePerKmFcfa: 0,
    taxWithholdingRate: 0.11,
    sessionCapFcfa: 120_000,
    monthlyCapFcfa: 350_000,
    annualCapFcfa: 3_500_000,
    active: true,
  },
  {
    id: 'scale-sec-ouv',
    entityId: null,
    fiscalYear: 2026,
    scaleName: 'Barème National — Secrétaire / SIGAMP (Ouverture)',
    legalReference: 'Décret Barèmes Commissions des Marchés',
    commissionType: null,
    roleCode: 'CPM_SECRETAIRE',
    triggerEvent: 'OUVERTURE_PLIS',
    procurementMode: null,
    contractAmountMinFcfa: 0,
    contractAmountMaxFcfa: null,
    baseAmountFcfa: 35_000,
    perLotBonusFcfa: 5_000,
    perBidBonusFcfa: 0,
    dailyMissionAllowanceFcfa: 0,
    transportRatePerKmFcfa: 0,
    taxWithholdingRate: 0.11,
    sessionCapFcfa: 120_000,
    monthlyCapFcfa: 350_000,
    annualCapFcfa: 3_500_000,
    active: true,
  },
  {
    id: 'scale-armp-ouv',
    entityId: null,
    fiscalYear: 2026,
    scaleName: 'Barème National — Observateur Indépendant ARMP',
    legalReference: 'Circulaire ARMP Observateurs Indépendants',
    commissionType: null,
    roleCode: 'ARMP_OBSERVATEUR',
    triggerEvent: 'OUVERTURE_PLIS',
    procurementMode: null,
    contractAmountMinFcfa: 0,
    contractAmountMaxFcfa: null,
    baseAmountFcfa: 40_000,
    perLotBonusFcfa: 5_000,
    perBidBonusFcfa: 0,
    dailyMissionAllowanceFcfa: 0,
    transportRatePerKmFcfa: 150,
    taxWithholdingRate: 0.11,
    sessionCapFcfa: 140_000,
    monthlyCapFcfa: 400_000,
    annualCapFcfa: 4_000_000,
    active: true,
  },
  {
    id: 'scale-sca-rap',
    entityId: null,
    fiscalYear: 2026,
    scaleName: 'Barème National — Rapporteur SCA (Adoption Rapport)',
    legalReference: 'Décret Barèmes SCA',
    commissionType: null,
    roleCode: 'SCA_RAPPORTEUR',
    triggerEvent: 'ADOPTION_RAPPORT_SCA',
    procurementMode: null,
    contractAmountMinFcfa: 0,
    contractAmountMaxFcfa: null,
    baseAmountFcfa: 45_000,
    perLotBonusFcfa: 10_000,
    perBidBonusFcfa: 3_000,
    dailyMissionAllowanceFcfa: 0,
    transportRatePerKmFcfa: 0,
    taxWithholdingRate: 0.11,
    sessionCapFcfa: 180_000,
    monthlyCapFcfa: 500_000,
    annualCapFcfa: 5_000_000,
    active: true,
  },
];
