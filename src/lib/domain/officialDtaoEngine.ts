import type { EntityType, FiscalRegime, ProcurementNature } from '../../types/domain';
import type { BpuDqeLineItem } from './bpuDqeEngine';
import { DEFAULT_REGULATORY_DAO_PARAMS, type RegulatoryDaoParams } from './daoAssemblerEngine';

export type OfficialDtaoSlug =
  | 'dtao_travaux_2024'
  | 'dtao_travaux_officiel'
  | 'dtao_fournitures_locales'
  | 'dtao_fournitures_importees'
  | 'dtao_services_pi_2024'
  | 'dt_demande_cotation';

export type OfficialLegalDocSlug =
  | 'decret_2018_366'
  | 'recueil_facilitation_2023'
  | 'manuel_passation_2023'
  | 'guide_regulation_2023';

export interface OfficialDocManifestItem {
  slug: string;
  title: string;
  kind: string;
  pdfPath: string;
  totalPages: number;
  description: string;
}

export const OFFICIAL_DTAO_LIST: OfficialDocManifestItem[] = [
  {
    slug: 'dt_demande_cotation',
    title: 'Dossier Type de Demande de Cotation (DT-DC ARMP)',
    kind: 'DC_COTATION',
    pdfPath: '/official-docs/dtao/DT_Demande_Cotation_ARMP.pdf',
    totalPages: 171,
    description:
      'Modèle officiel intégral (171 pages) : Pièce I Avis de Cotation, Pièce II Règlement de la Cotation (RPDC), Pièce III Clauses Techniques, Pièce IV-V BPU/DQE, Pièce VI Projet de Lettre-Commande (Travaux / Fournitures / Services).',
  },
  {
    slug: 'dtao_travaux_2024',
    title: 'DTAO Marchés de Travaux (Version 2024 ARMP)',
    kind: 'TRAVAUX',
    pdfPath: '/official-docs/dtao/DTAO_Travaux_2024.pdf',
    totalPages: 163,
    description:
      'Dossier Type complet (163 pages) : Avis, Grille, Accord-cadre / Travaux, Lettre d’invitation, Règlement de consultation, CCAP, CCTP, BPU, DQE, Cautions & Soumission en ligne.',
  },
  {
    slug: 'dtao_services_pi_2024',
    title: 'DTAO Services Non Quantifiables & Prestations Intellectuelles (2024)',
    kind: 'PRESTATIONS_INTELLECTUELLES',
    pdfPath: '/official-docs/dtao/DTAO_Services_Prestations_Intellectuelles_2024.pdf',
    totalPages: 175,
    description:
      'Dossier Type complet (175 pages) : Pièce 0 Lettre d’invitation, Pièce 1 AAO, Pièce 2 RGAO, Pièce 3 RPAO, Pièce 4 CCAP, Pièce 5 TDR, Pièces 6-7 Propositions technique & financière, Pièce 8 Contrat.',
  },
  {
    slug: 'dtao_fournitures_locales',
    title: 'DTAO Fournitures Achetées Localement (Arrêté 038/PM)',
    kind: 'FOURNITURES',
    pdfPath: '/official-docs/dtao/DTAO_Fournitures_Locales.pdf',
    totalPages: 108,
    description:
      'Copie PDF officielle complète ARMP (108 pages) pour marchés de fournitures locales (AAO, RGAO, RPAO, CCAP, Descriptif technique, BPU/DQE, Cautions COBAC).',
  },
  {
    slug: 'dtao_fournitures_importees',
    title: 'DTAO Fournitures Importées (Arrêté 038/PM)',
    kind: 'FOURNITURES',
    pdfPath: '/official-docs/dtao/DTAO_Fournitures_Importees.pdf',
    totalPages: 104,
    description:
      'Copie PDF officielle complète ARMP (104 pages) pour marchés de fournitures importées (Incoterms, RGAO/RPAO, CCAP, Garanties bancaires).',
  },
  {
    slug: 'dtao_travaux_officiel',
    title: 'DTAO Marchés de Travaux Classique (Arrêté 038/PM)',
    kind: 'TRAVAUX',
    pdfPath: '/official-docs/dtao/DTAO_Travaux.pdf',
    totalPages: 118,
    description:
      'Copie PDF officielle originale de l’Arrêté n° 038/CAB/PM (118 pages, 13 pièces complètes).',
  },
];

export const OFFICIAL_LEGAL_LIBRARY_LIST: OfficialDocManifestItem[] = [
  {
    slug: 'decret_2018_366',
    title: 'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
    kind: 'CODE_MARCHES',
    pdfPath: '/official-docs/laws/Decret_2018_366_Code_Marches_Publics.pdf',
    totalPages: 98,
    description: 'Texte intégral officiel du Code des Marchés Publics du Cameroun (98 pages).',
  },
  {
    slug: 'recueil_facilitation_2023',
    title: 'Recueil des Documents de Facilitation des Marchés Publics (ARMP / MINMAP Mai 2023)',
    kind: 'FACILITATION',
    pdfPath: '/official-docs/laws/Recueil_Documents_Facilitation_ARMP_2023.pdf',
    totalPages: 83,
    description:
      '38 formulaires & modèles officiels + 15 canevas de PV, rapports SCAO, OI, CCCM et rapports périodiques (83 pages).',
  },
  {
    slug: 'manuel_passation_2023',
    title: 'Manuel des Procédures de Passation des Marchés Publics (ARMP)',
    kind: 'MANUEL_PROCEDURES',
    pdfPath: '/official-docs/laws/Manuel_Procedures_Passation_ARMP_2023.pdf',
    totalPages: 42,
    description:
      'Mode opératoire détaillé, conditions et délais réglementaires pour chaque procédure (42 pages).',
  },
  {
    slug: 'guide_regulation_2023',
    title: 'Guide de la Régulation des Marchés Publics (ARMP)',
    kind: 'GUIDE_REGULATION',
    pdfPath: '/official-docs/laws/Guide_Regulation_ARMP_2023.pdf',
    totalPages: 79,
    description:
      'Référentiel de contrôle, examen préalable des DCE, additifs, cautions et régularité (79 pages).',
  },
];

export interface ContextualDtaoAdaptationInput {
  slug: OfficialDtaoSlug;
  entityName: string;
  entityType: EntityType;
  parentTutelleName?: string;
  hasOwnCipm: boolean;
  city: string;
  fiscalYear: number;
  consultationNumber: string;
  signatureDateFormatted: string;
  projectTitle: string;
  nature: ProcurementNature;
  fundingSource: string;
  budgetImputation: string;
  estimatedAmountTtc: number;
  executionDays: number;
  submissionDeadlineFormatted: string;
  openingDatetimeFormatted: string;
  daoPurchasePriceFcfa: number;
  fiscalRegime: FiscalRegime;
  isUrgency: boolean;
  technicalSummary?: string;
  regulatoryParams?: Partial<RegulatoryDaoParams>;
  bpuItems?: BpuDqeLineItem[];
  blankBidderTables?: boolean;
}

export interface OfficialPageData {
  page: number;
  text: string;
}

export interface AdaptedOfficialDtaoBundle {
  slug: OfficialDtaoSlug;
  title: string;
  totalPages: number;
  pages: OfficialPageData[];
  appliedContextSummary: string;
}

export function applyContextualLegalAdaptationsToText(
  rawText: string,
  input: ContextualDtaoAdaptationInput
): string {
  const params = { ...DEFAULT_REGULATORY_DAO_PARAMS, ...(input.regulatoryParams ?? {}) };
  const bidBondAmount = Math.round(input.estimatedAmountTtc * params.bidBondRate);
  const commissionLabel =
    input.entityType === 'PREFECTURE' || (input.entityType === 'COMMUNE' && !input.hasOwnCipm)
      ? `Commission Départementale de Passation des Marchés (${input.parentTutelleName || 'Préfecture'})`
      : input.entityType === 'GOUVERNORAT' || input.entityType === 'REGION'
        ? 'Commission Régionale de Passation des Marchés (CRPM)'
        : `Commission Interne de Passation des Marchés (CIPM) de ${input.entityName}`;

  const airRateLabel =
    input.fiscalRegime === 'REEL'
      ? '2,2 % (Régime du Réel - CGI)'
      : input.fiscalRegime === 'SIMPLIFIE'
        ? '5,5 % (Régime Simplifié - CGI)'
        : 'Selon régime fiscal CGI en vigueur';

  const formattedAmount = `${Math.round(input.estimatedAmountTtc).toLocaleString('fr-FR')} FCFA TTC`;
  const formattedBond = `${bidBondAmount.toLocaleString('fr-FR')} FCFA (${(params.bidBondRate * 100).toFixed(1)} %)`;
  const formattedPrice = `${Math.round(input.daoPurchasePriceFcfa).toLocaleString('fr-FR')} FCFA`;

  let out = rawText;

  // Remplacement fidèle des champs entre crochets officiels ARMP
  const replacements: Array<[RegExp, string]> = [
    [/\[MAITRE D[’']OUVRAGE OU MAITRE D[’']OUVRAGE DELEGUE\]/gi, input.entityName],
    [/\[MAITRE D[’']OUVRAGE\]/gi, input.entityName],
    [/\[ins[ée]rer d[ée]nomination\]/gi, input.entityName],
    [/\[COMMISSION[^\]]*\]/gi, commissionLabel],
    [/\[Exercice budg[ée]taire\]/gi, String(input.fiscalYear)],
    [/\[Date de signature[^\]]*\]/gi, input.signatureDateFormatted],
    [/\[Objet de l[’']Appel d[’']Offres\]/gi, input.projectTitle],
    [/\[Objet de(?: de)? la (?:Consultation|Demande de Cotation)\]/gi, input.projectTitle],
    [/\[objet de la consultation\]/gi, input.projectTitle],
    [/\[Indiquer le d[ée]lai pr[ée]visionnel[^\]]*\]/gi, `${input.executionDays} jours calendaires`],
    [/\[indiquer le montant forfaitaire en FCFA[^\]]*\]/gi, formattedBond],
    [/\[ins[ée]rer le montant en chiffres et en lettres[^\]]*\]/gi, formattedPrice],
    [/\[Lieu de retrait[^\]]*\]/gi, `SIGAMP / Service des Marchés — ${input.entityName} (${input.city})`],
    [/FINANCEMENT\s*:\s*[…\.]+/gi, `FINANCEMENT : ${input.fundingSource}`],
    [/IMPUTATION\s*:\s*[…\.]+/gi, `IMPUTATION : ${input.budgetImputation}`],
    [/EXERCICE\s*\(s\)\s*[…\.]+/gi, `EXERCICE : ${input.fiscalYear}`],
    [/Dossier de Demande de Cotation N°[…\.]+/gi, `Dossier de Demande de Cotation N° ${input.consultationNumber}`],
    [/Dossier d[’']Appel d[’']Offres[^\n]*N°[…\.]+/gi, `Dossier d'Appel d'Offres N° ${input.consultationNumber}`],
  ];

  for (const [pattern, val] of replacements) {
    out = out.replace(pattern, val);
  }

  // Injection sur la page 1 d'un cartouche récapitulatif des paramètres légaux à jour
  if (rawText.includes('REPUBLIQUE DU CAMEROUN') && rawText.includes('FINANCEMENT')) {
    out += `\n\n[PARAMÈTRES CONTEXTUELS & LOI EN VIGUEUR INJECTÉS PAR SIGAMP-CM]\n• N° Consultation : ${input.consultationNumber} (${input.isUrgency ? "Procédure d'Urgence Art. 87(2)" : 'Procédure Ordinaire'})\n• Commission compétente : ${commissionLabel}\n• Coût prévisionnel : ${formattedAmount} | Caution soumission : ${formattedBond}\n• Date limite dépôt : ${input.submissionDeadlineFormatted} | Ouverture : ${input.openingDatetimeFormatted}\n• Fiscalité Loi de Finances : TVA ${(params.tvaRate * 100).toFixed(2)} % | AIR ${airRateLabel} | Retenue garantie ${(params.guaranteeRetentionRate * 100).toFixed(0)} % | Validité offres : ${params.offerValidityDays} jours`;
    if (input.technicalSummary) {
      out += `\n• Spécifications / Consistance : ${input.technicalSummary}`;
    }
  }

  return out;
}
