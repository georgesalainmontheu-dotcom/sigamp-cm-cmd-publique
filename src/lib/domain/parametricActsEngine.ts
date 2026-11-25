import type {
  ContractType,
  EntityType,
  FiscalRegime,
  ProcurementMode,
  ProcurementNature,
  RbacRole,
} from '../../types/domain';
import type { HierarchyDirection } from '../../types/ai';

export type FundingSourceType =
  | 'BIP_ETAT'
  | 'BUDGET_COMMUNAL'
  | 'FEICOM'
  | 'FONDS_ROUTIER'
  | 'BAILLEUR_EXTERNE';

export interface ParametricActDefinition {
  actCode: string;
  roleOwner: RbacRole;
  roleGroupLabel:
    | 'MO / MOD (Autorité Contractante)'
    | 'SIGAMP / Cellule des Marchés'
    | 'CPM (CIPM / CDPM / CRPM) & SCA'
    | 'CCCM / ARMP / Tutelle (Préfecture / Gouvernorat)'
    | 'Contrôleur Financier & Receveur'
    | 'Ingénieur & Chef de Service du Marché'
    | 'Soumissionnaire / Entreprise';
  title: string;
  legalBasis: string;
  officialRecueilRef?: string;
  hierarchyDirection: HierarchyDirection;
  defaultRecipientRank: string;
  lockedLegalClause: string;
  adaptableBodyTemplate: string;
  defaultAmpliations: string[];
}

export interface ParametricAdaptationContext {
  entityName: string;
  entityCode: string;
  entityType: EntityType;
  parentTutelleName?: string;
  hasOwnCipm: boolean;
  city: string;
  fiscalYear: number;
  chronoNumber: string;
  dateFormatted: string;
  signerTitle: string;
  signerName: string;
  recipientLabel: string;
  projectCode: string;
  projectTitle: string;
  nature: ProcurementNature;
  procurementMode: ProcurementMode;
  contractType: ContractType;
  fundingSource: FundingSourceType;
  fiscalRegime: FiscalRegime;
  isUrgency: boolean;
  isMultiLot: boolean;
  lotSummary?: string;
  amountTtcFcfa: number;
  executionDays: number;
  supplierName?: string;
  supplierNiu?: string;
  customAdaptableClause?: string;
}

export interface RenderedParametricAct {
  act: ParametricActDefinition;
  timbreBlock: string;
  commissionCompetente: string;
  tutelleVisaNote: string;
  fiscalNote: string;
  subject: string;
  lockedSection: string;
  adaptableSection: string;
  fullDocumentText: string;
  ampliations: string[];
}

/**
 * Catalogue exhaustif des 44 Actes Réglementaires Paramétriques de la Commande Publique Camerounaise
 * Aligné sur le Décret n° 2018/366 et le Recueil des Documents de Facilitation ARMP/MINMAP (Mai 2023).
 */
export const PARAMETRIC_ACTS_CATALOG_44: ParametricActDefinition[] = [
  // === I. MO / MOD (13 actes) ===
  {
    actCode: 'ACT_01_NOTE_PRESENTATION_DCE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '01. Note de présentation du Dossier de Consultation (DAO / DC)',
    legalBasis: 'CMP Art. 23(a) & Document 6 Recueil ARMP',
    officialRecueilRef: 'Document 6',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Président de la Commission de Passation des Marchés',
    lockedLegalClause:
      'Établie conformément à l’article 23 du Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics et au Document 6 du Recueil des Documents de Facilitation ARMP.',
    adaptableBodyTemplate:
      "La présente note soumet à l'examen de {{commission_competente}} le projet de dossier de consultation relatif à : {{project_title}} (Réf. {{project_code}}).\nMontant prévisionnel TTC : {{amount_ttc}} FCFA | Financement : {{funding_label}} | Délai d'exécution : {{execution_days}} jours.\n{{urgency_note}}",
    defaultAmpliations: ['MINMAP', 'ARMP', 'Tutelle (Préfet/Gouverneur)', 'Chrono/Archives'],
  },
  {
    actCode: 'ACT_02_DECISION_DESIGNATION_INGENIEUR',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '02. Décision de désignation Chef de Service & Ingénieur du Marché',
    legalBasis: 'CMP Art. 147 & CCAG Art. 2',
    hierarchyDirection: 'DESCENDANT',
    defaultRecipientRank: 'Chef de Service & Ingénieur du Marché désignés',
    lockedLegalClause:
      'Vu le Décret n° 2018/366 portant Code des Marchés Publics, notamment en ses dispositions relatives à la maîtrise d’œuvre publique et au suivi de l’exécution.',
    adaptableBodyTemplate:
      "Sont désignés pour le suivi technique et administratif du projet {{project_code}} ({{project_title}}) :\n- Chef de Service du Marché : Responsable des Marchés de {{entity_name}}\n- Ingénieur du Marché : Chef des Services Techniques / Expert sectoriel habilité.",
    defaultAmpliations: ['Intéressés', 'CPM compétente', 'MINMAP/DDMAP', 'Contrôleur Financier', 'Archives'],
  },
  {
    actCode: 'ACT_03_DECISION_COMPOSITION_CPM',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '03. Décision constatant la composition de la CPM / CDPM / CRPM',
    legalBasis: 'CMP Art. 11 à 16 & Document 1 Recueil ARMP',
    officialRecueilRef: 'Document 1',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'MINMAP / ARMP / Membres de la Commission',
    lockedLegalClause:
      'Conformément à l’article 16 du Décret n° 2018/366, l’acte constatant la composition de la Commission de Passation des Marchés est transmis sans délai au MINMAP et à l’ARMP.',
    adaptableBodyTemplate:
      "La composition de {{commission_competente}} placée auprès de {{entity_name}} pour l'exercice {{fiscal_year}} est constatée ainsi qu'il suit :\n- Président désigné par l'Autorité chargée des Marchés Publics\n- Représentants MINMAP, MINFI, MINEPAT et Maître d'Ouvrage\n- Secrétaire désigné.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'Préfet/Gouverneur', 'Intéressés', 'Archives'],
  },
  {
    actCode: 'ACT_04_AAO_OU_AVIS_COTATION_BILINGUE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '04. Avis d’Appel d’Offres (AAO) ou Avis de Demande de Cotation (Bilingue FR/EN)',
    legalBasis: 'CMP Art. 86-90 & Pièce 1 DTAO / DT-DC',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Entreprises & Candidats (Publication JDM / COLEPS)',
    lockedLegalClause:
      'Strict respect du bilinguisme (Français / Anglais) prescrit par les textes en vigueur et mention obligatoire de la validité des offres de 90 jours et du taux de cautionnement de soumission (<= 2 %).',
    adaptableBodyTemplate:
      "[FR] {{signer_title}} lance un {{mode_label}} pour : {{project_title}} (Financement : {{funding_label}}, Coût prévisionnel : {{amount_ttc}} FCFA TTC, Délai : {{execution_days}} jours).\n[EN] The Contracting Authority hereby launches a tender for {{project_title}} (Estimated cost: {{amount_ttc}} FCFA TTC).",
    defaultAmpliations: ['MINMAP', 'ARMP (JDM)', 'CPM compétente', 'Affichage', 'Archives'],
  },
  {
    actCode: 'ACT_05_ADDITIF_PROROGATION_DELAI',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '05. Additif & Communiqué de prorogation de délai (Bilingue)',
    legalBasis: 'CMP Art. 89 & RGAO Art. 9',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Soumissionnaires ayant retiré le DAO & ARMP (JDM)',
    lockedLegalClause:
      'Tout additif substantiel ou publié à moins de sept (07) jours de la date limite de remise des offres entraîne de plein droit la prorogation de la date limite d’ouverture des plis.',
    adaptableBodyTemplate:
      "Le dossier {{project_code}} ({{project_title}}) fait l'objet d'un additif modificatif. En conséquence, la date limite de dépôt et d'ouverture des plis est prorogée afin de garantir l'égalité de traitement des candidats.",
    defaultAmpliations: ['MINMAP', 'ARMP (JDM)', 'CPM', 'Candidats acquéreurs', 'Archives'],
  },
  {
    actCode: 'ACT_06_DECISION_ATTRIBUTION',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '06. Décision d’attribution du Marché / Lettre-Commande',
    legalBasis: 'CMP Art. 102 & Document 8 Recueil ARMP',
    officialRecueilRef: 'Document 8',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Attributaire, ARMP (JDM), MINMAP, CPM',
    lockedLegalClause:
      'Vu la proposition d’attribution formulée par la Commission de Passation des Marchés compétente et, le cas échéant, l’avis conforme de la Commission Centrale de Contrôle des Marchés.',
    adaptableBodyTemplate:
      "Article 1er : L'entreprise {{supplier_name}} (NIU : {{supplier_niu}}) est déclarée attributaire du {{contract_type_label}} relatif à {{project_title}} (Réf. {{project_code}}) pour un montant de {{amount_ttc}} FCFA TTC et un délai d'exécution de {{execution_days}} jours.\nArticle 2 : L'attributaire dispose d'un délai réglementaire pour souscrire le projet de contrat.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'CPM', 'Contrôleur Financier', 'Intéressé', 'Archives'],
  },
  {
    actCode: 'ACT_07_DECISION_INFRUCTUOSITE_SANS_SUITE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '07. Décision déclarant l’Appel d’Offres infructueux ou sans suite',
    legalBasis: 'CMP Art. 104',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'ARMP (Publication JDM), MINMAP, CPM, Candidats',
    lockedLegalClause:
      'En application de l’article 104 du Décret n° 2018/366, la procédure peut être déclarée infructueuse faute d’offre conforme ou sans suite pour motif d’intérêt général dûment justifié.',
    adaptableBodyTemplate:
      "La consultation relative au projet {{project_code}} ({{project_title}}) est déclarée infructueuse / sans suite. Les cautions de soumission des candidats sont libérées sans délai.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'CPM', 'Soumissionnaires', 'Archives'],
  },
  {
    actCode: 'ACT_08_NOTIFICATION_ATTRIBUTION_ET_REJET',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '08. Notification d’attribution & Lettre de rejet motivée',
    legalBasis: 'CMP Art. 103 & Document 9 Recueil ARMP',
    officialRecueilRef: 'Document 9',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Entreprise Attributaire / Candidats non retenus',
    lockedLegalClause:
      'Ouvre le délai suspensif (standstill) de cinq (05) jours ouvrables permettant aux soumissionnaires non retenus d’exercer un éventuel recours avant signature du contrat.',
    adaptableBodyTemplate:
      "J'ai l'honneur de vous notifier l'issue de l'appel d'offres {{project_code}} ({{project_title}}) attribué à {{supplier_name}} pour {{amount_ttc}} FCFA TTC. Les candidats non retenus sont invités à retirer leur cautionnement de soumission.",
    defaultAmpliations: ['CPM', 'ARMP', 'Banques émettrices', 'Archives'],
  },
  {
    actCode: 'ACT_09_PROJET_CONTRAT_LC_MARCHE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '09. Projet de Marché / Lettre-Commande / Bon de Commande Administratif',
    legalBasis: 'CMP Art. 10-12, Manuel MINMAP II.3.4 & Pièce 10 DTAO',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Cocontractant de l’Administration & Services des Impôts',
    lockedLegalClause:
      'Sept (07) exemplaires originaux sont soumis aux formalités de timbre et d’enregistrement fiscal par les soins et aux frais du Cocontractant (CCAG Art. 37). Régime fiscal appliqué selon NIU.',
    adaptableBodyTemplate:
      "{{contract_type_label}} relatif à {{project_title}} (Réf. {{project_code}}), conclu entre {{entity_name}} et {{supplier_name}}.\nMontant TTC : {{amount_ttc}} FCFA | {{fiscal_note}} | Délai : {{execution_days}} jours.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'Contrôleur Financier', 'Receveur/Trésor', 'Titulaire', 'Archives'],
  },
  {
    actCode: 'ACT_10_DEMANDE_AUTORISATION_GRE_A_GRE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '10. Saisine MINMAP pour autorisation de Gré à Gré (Note de Présentation)',
    legalBasis: 'CMP Art. 109-111 & Document 12 Recueil ARMP',
    officialRecueilRef: 'Document 12',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Monsieur le Ministre Délégué à la Présidence chargé des Marchés Publics',
    lockedLegalClause:
      'Aucun marché de gré à gré ne peut être conclu sans autorisation préalable expresse de l’Autorité chargée des Marchés Publics (MINMAP) dans les cas limitatifs de l’article 109 du CMP.',
    adaptableBodyTemplate:
      "J'ai l'honneur de solliciter votre haute autorisation pour le recours exceptionnel au gré à gré pour l'opération {{project_code}} ({{project_title}}), d'un montant de {{amount_ttc}} FCFA TTC, justifié par les circonstances exceptionnelles détaillées ci-joint.",
    defaultAmpliations: ['ARMP', 'Tutelle (Préfet/Gouverneur)', 'CPM', 'Archives'],
  },
  {
    actCode: 'ACT_11_MISE_EN_DEMEURE_ET_RESILIATION',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '11. Mise en demeure & Décision de résiliation (Art. 182 CMP)',
    legalBasis: 'CMP Art. 182-186 & Documents 36-38 Recueil ARMP',
    officialRecueilRef: 'Documents 36-38',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Entreprise Titulaire & Caution Bancaire',
    lockedLegalClause:
      'La résiliation pour faute du cocontractant est obligatoirement précédée d’une mise en demeure écrite assortie d’un délai réglementaire de vingt-et-un (21) jours minimum restée infructueuse.',
    adaptableBodyTemplate:
      "Suite aux manquements constatés sur le chantier {{project_code}} ({{project_title}}), la société {{supplier_name}} est mise en demeure de reprendre l'exécution dans un délai de 21 jours calendaires, sous peine de résiliation aux torts exclusifs et confiscation des cautions.",
    defaultAmpliations: ['MINMAP', 'ARMP (Exclusion/CNE)', 'Ingénieur du Marché', 'Banque caution', 'Archives'],
  },
  {
    actCode: 'ACT_12_AVENANT_ET_NOTE_PRESENTATION',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '12. Projet d’Avenant & Note de présentation (Plafond 30 %)',
    legalBasis: 'CMP Art. 142-146 & Document 13 Recueil ARMP',
    officialRecueilRef: 'Document 13',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'CPM compétente / CCCM / Contrôleur Financier',
    lockedLegalClause:
      'Conformément au Code des Marchés Publics, le montant cumulé des avenants ne peut en aucun cas excéder trente pour cent (30 %) du montant du marché initial, sous peine de nullité d’ordre public.',
    adaptableBodyTemplate:
      "Le présent projet d'avenant n°01 au {{contract_type_label}} {{project_code}} ({{project_title}}) a pour objet l'ajustement technique/financier des prestations confiées à {{supplier_name}} dans le strict respect du plafond légal de 30 %.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'CPM/CCCM', 'Contrôleur Financier', 'Titulaire', 'Archives'],
  },
  {
    actCode: 'ACT_13_ATTESTATION_BONNE_EXECUTION_ET_MAINLEVEE',
    roleOwner: 'MO_MOD',
    roleGroupLabel: 'MO / MOD (Autorité Contractante)',
    title: '13. Attestation de Bonne Fin / Bonne Exécution & Mainlevée de Cautions',
    legalBasis: 'CMP Art. 152 & Documents 15 / 22 Recueil ARMP',
    officialRecueilRef: 'Documents 15 & 22',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Titulaire & Établissement Bancaire Émetteur',
    lockedLegalClause:
      'Délivrée uniquement au vu du Procès-Verbal de Réception Provisoire (pour caution de bonne exécution) ou Définitive (pour retenue de garantie 10 %) dûment signé sans réserves bloquantes.',
    adaptableBodyTemplate:
      "{{signer_title}} atteste que la société {{supplier_name}} a exécuté à entière satisfaction les prestations du projet {{project_code}} ({{project_title}}). Mainlevée totale et définitive de la caution est accordée.",
    defaultAmpliations: ['Banque émettrice', 'Receveur/Comptable', 'ARMP', 'Archives'],
  },

  // === II. SIGAMP (6 actes) ===
  {
    actCode: 'ACT_14_SAISINE_CPM_EXAMEN_DCE_OU_RAPPORT',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '14. Saisine officielle de la CPM (CIPM / CDPM / CRPM)',
    legalBasis: 'CMP Art. 9, 13 & 23',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Président de la CPM / CDPM / CRPM',
    lockedLegalClause:
      'La Commission compétente est saisie par bordereau accompagné des pièces obligatoires prévues à l’article 23 du Décret n° 2018/366.',
    adaptableBodyTemplate:
      "Le Chef du SIGAMP transmet pour examen en session de {{commission_competente}} le dossier {{project_code}} ({{project_title}}) comprenant les pièces réglementaires complètes.\n{{tutelle_note}}",
    defaultAmpliations: ['MO/MOD', 'MINMAP/DDMAP', 'Observateur Indépendant (si seuil)', 'Archives'],
  },
  {
    actCode: 'ACT_15_SAISINE_CCCM_CONTROLE_A_PRIORI',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '15. Saisine de la Commission Centrale de Contrôle des Marchés (CCCM)',
    legalBasis: 'CMP Art. 28-32 & Arrêté CCCM',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Président de la CCCM compétente (TR / AG / SPI / FC)',
    lockedLegalClause:
      'Obligatoire pour tout marché atteignant ou dépassant les seuils de compétence de la CCCM (Travaux >= 1 Md FCFA, Fournitures >= 500 M, Services/PI >= 100 M ou seuils spécifiques).',
    adaptableBodyTemplate:
      "J'ai l'honneur de soumettre à l'avis préalable de la CCCM le dossier {{project_code}} ({{project_title}}) d'un montant de {{amount_ttc}} FCFA TTC après examen favorable de {{commission_competente}}.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'MO/MOD', 'Archives'],
  },
  {
    actCode: 'ACT_16_SAISINE_ARMP_ENV_C_ET_JDM',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '16. Saisine de l’ARMP (Enveloppe C témoin Art. 92(8) & Publication JDM)',
    legalBasis: 'CMP Art. 92(8) & Art. 86',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Directeur Général de l’ARMP / Chef Centre Régional ARMP',
    lockedLegalClause:
      'Conformément à l’article 92 alinéa 8 du Décret n° 2018/366, une copie témoin de l’offre financière (Enveloppe C) ainsi que tous les avis, décisions d’attribution et contrats sont transmis à l’ARMP pour conservation et publication au JDM.',
    adaptableBodyTemplate:
      "Le SIGAMP de {{entity_name}} transmet à l'ARMP, aux fins de conservation réglementaire et d'insertion au Journal des Marchés Publics (JDM), les actes relatifs au dossier {{project_code}} ({{project_title}}).",
    defaultAmpliations: ['MINMAP', 'MO/MOD', 'CPM', 'Archives'],
  },
  {
    actCode: 'ACT_17_SAISINE_MINMAP_VISA_OU_DEROGATION',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '17. Saisine du MINMAP / DDMAP (Visa décompte final, dérogation ou contrôle)',
    legalBasis: 'CMP Art. 50 & Circulaire d’application',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'MINMAP / Délégué Régional ou Départemental des Marchés Publics',
    lockedLegalClause:
      'Le Ministère des Marchés Publics assure le suivi du contrôle externe et appose son visa préalable sur le décompte général et définitif des marchés de travaux ou dernière facture.',
    adaptableBodyTemplate:
      "Transmission pour compétence et visa réglementaire des pièces du dossier {{project_code}} ({{project_title}}) exécuté par {{supplier_name}} pour un montant de {{amount_ttc}} FCFA TTC.",
    defaultAmpliations: ['ARMP', 'MO/MOD', 'Contrôleur Financier', 'Archives'],
  },
  {
    actCode: 'ACT_18_BORDEREAU_TRANSMISSION_INTERNE',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '18. Bordereau de Transmission Administratif Inter-Services',
    legalBasis: 'Procédures administratives & Manuel MINMAP',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Service Destinataire (CF, STM, Secrétariat Général, Recette)',
    lockedLegalClause:
      'Assure la traçabilité physique et numérique (numéro chrono séquentiel) de la circulation du dossier entre organes.',
    adaptableBodyTemplate:
      "Veuillez trouver ci-joint, pour attribution et suite à donner, le dossier complet du marché {{project_code}} ({{project_title}}) — {{entity_name}}.",
    defaultAmpliations: ['Chrono/Archives'],
  },
  {
    actCode: 'ACT_19_RAPPORT_PERIODIQUE_SIGAMP',
    roleOwner: 'SIGAMP',
    roleGroupLabel: 'SIGAMP / Cellule des Marchés',
    title: '19. Rapport périodique trimestriel / annuel SIGAMP (Canevas 15 ARMP)',
    legalBasis: 'Canevas 15 Recueil Documents de Facilitation ARMP',
    officialRecueilRef: 'Canevas 15',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Autorité Contractante, MINMAP & ARMP',
    lockedLegalClause:
      'Présente la synthèse statistique de l’exécution du Plan de Passation des Marchés (PPM), les délais moyens de passation, le taux d’exécution financière et les contentieux.',
    adaptableBodyTemplate:
      "Bilan de la commande publique de {{entity_name}} pour l'exercice {{fiscal_year}} établi selon le Canevas 15 officiel du Recueil ARMP.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'Tutelle (Préfet/Gouverneur)', 'Archives'],
  },

  // === III. CPM & SCA (7 actes) ===
  {
    actCode: 'ACT_20_CONVOCATION_SESSION_CPM',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '20. Convocation officielle de session CPM (avec ordre du jour)',
    legalBasis: 'CMP Art. 18-22',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Membres de la CPM, Observateur Indépendant & Représentant MO',
    lockedLegalClause:
      'Les convocations accompagnées des dossiers à examiner doivent parvenir aux membres au moins quarante-huit (48) à soixante-douze (72) heures avant la séance. Quorum requis pour délibérer.',
    adaptableBodyTemplate:
      "Le Président de {{commission_competente}} invite les membres à prendre part à la séance consacrée à l'examen du dossier {{project_code}} ({{project_title}}).",
    defaultAmpliations: ['MO/MOD', 'Observateur Indépendant', 'Secrétariat CPM', 'Archives'],
  },
  {
    actCode: 'ACT_21_FEUILLE_EMARGEMENT_SESSION',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '21. Fiche de présence / Émargement & Vérification du Quorum',
    legalBasis: 'CMP Art. 20 & Barème indemnités',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Dossier de séance & Ordonnateur des indemnités',
    lockedLegalClause:
      'Pièce justificative obligatoire pour la validité des délibérations (quorum) et pour la liquidation des indemnités de session.',
    adaptableBodyTemplate:
      "Feuille d'émargement certifiée de la séance de {{commission_competente}} tenue à {{city}} relative au dossier {{project_code}}.",
    defaultAmpliations: ['Secrétariat CPM', 'Contrôleur Financier', 'Archives'],
  },
  {
    actCode: 'ACT_22_PV_EXAMEN_DCE_PAR_CPM',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '22. Procès-Verbal d’examen du DCE (DAO / DC) par la CPM (Canevas 1)',
    legalBasis: 'Canevas 1 Recueil Documents de Facilitation ARMP',
    officialRecueilRef: 'Canevas 1',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Maître d’Ouvrage / Maître d’Ouvrage Délégué',
    lockedLegalClause:
      'Vérifie la conformité au DTAO/DTDC en vigueur, l’absence de critères discriminatoires (Art. 56 CMP) et la présence des justificatifs des études préalables.',
    adaptableBodyTemplate:
      "À l'issue de l'examen du dossier {{project_code}} ({{project_title}}), {{commission_competente}} émet un avis favorable (ou favorable sous réserve des amendements consignés).",
    defaultAmpliations: ['MO/MOD', 'ARMP', 'MINMAP', 'Archives'],
  },
  {
    actCode: 'ACT_23_PV_OUVERTURE_PLIS',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '23. Procès-Verbal d’ouverture des plis (1 ou 2 temps — Canevas 2)',
    legalBasis: 'CMP Art. 92-95 & Canevas 2 Recueil ARMP',
    officialRecueilRef: 'Canevas 2',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'ARMP, MINMAP, MO/MOD & Soumissionnaires présents',
    lockedLegalClause:
      'Constate en séance publique la liste des plis reçus dans les délais, l’existence des cautions de soumission, les montants lus à haute voix (si ouverture en 1 temps) et désigne la Sous-Commission d’Analyse.',
    adaptableBodyTemplate:
      "Procès-verbal d'ouverture publique des plis du dossier {{project_code}} ({{project_title}}). Séance présidée par le Président de {{commission_competente}} en présence des représentants des soumissionnaires.",
    defaultAmpliations: ['MO/MOD', 'ARMP', 'MINMAP', 'Soumissionnaires', 'Archives'],
  },
  {
    actCode: 'ACT_24_DECISION_COMPOSITION_SCA',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '24. Note / Décision constatant la composition de la Sous-Commission d’Analyse (Doc 7)',
    legalBasis: 'CMP Art. 25 & Document 7 Recueil ARMP',
    officialRecueilRef: 'Document 7',
    hierarchyDirection: 'DESCENDANT',
    defaultRecipientRank: 'Membres et Rapporteur de la SCA',
    lockedLegalClause:
      'La SCA dispose d’un délai réglementaire strict (généralement 7 à 15 jours selon complexité) et ses membres sont astreints au secret des délibérations et à la déclaration d’absence de conflit d’intérêts.',
    adaptableBodyTemplate:
      "La Sous-Commission d'Analyse des offres du dossier {{project_code}} ({{project_title}}) est constituée pour évaluer la conformité administrative, technique et financière des offres.",
    defaultAmpliations: ['MO/MOD', 'Observateur Indépendant', 'Membres SCA', 'Archives'],
  },
  {
    actCode: 'ACT_25_RAPPORT_ANALYSE_SCA_ET_SYNTHESE',
    roleOwner: 'SCA_RAPPORTEUR',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '25. Rapport d’Analyse SCA & Synthèse (Canevas 7, 8, 9 & 10 ARMP)',
    legalBasis: 'CMP Art. 98-100 & Canevas 7-10 Recueil ARMP',
    officialRecueilRef: 'Canevas 7-10',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Président et Membres de la CPM',
    lockedLegalClause:
      'Applique les critères éliminatoires et essentiels (binaires pour travaux/fournitures, ou notation par points pour prestations intellectuelles), vérifie les erreurs arithmétiques et détecte toute Offre Anormalement Basse (OAB).',
    adaptableBodyTemplate:
      "Rapport d'analyse technique et financière des offres du dossier {{project_code}} ({{project_title}}), établi sur la base du devis confidentiel déverrouillé à l'issue de l'analyse technique.",
    defaultAmpliations: ['CPM compétente', 'Observateur Indépendant', 'Archives'],
  },
  {
    actCode: 'ACT_26_PV_PROPOSITION_ATTRIBUTION_ET_INDEMNITES',
    roleOwner: 'CPM_PRESIDENT',
    roleGroupLabel: 'CPM (CIPM / CDPM / CRPM) & SCA',
    title: '26. PV d’examen Rapport SCA, Proposition d’Attribution (Canevas 3) & État d’Indemnités',
    legalBasis: 'CMP Art. 101 & Canevas 3 Recueil ARMP',
    officialRecueilRef: 'Canevas 3',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Autorité Contractante (MO / MOD) & Contrôleur Financier',
    lockedLegalClause:
      'Formule la proposition motivée d’attribution à l’attention de l’Autorité Contractante et liquide les indemnités de session selon les plafonds réglementaires.',
    adaptableBodyTemplate:
      "{{commission_competente}} adopte le rapport de la SCA relatif à {{project_code}} et propose d'attribuer le contrat à {{supplier_name}} pour {{amount_ttc}} FCFA TTC.",
    defaultAmpliations: ['MO/MOD', 'MINMAP', 'ARMP', 'Contrôleur Financier', 'Archives'],
  },

  // === IV. CCCM / ARMP / TUTELLE PREFECTURE (4 actes) ===
  {
    actCode: 'ACT_27_AVIS_MOTIVE_CCCM',
    roleOwner: 'CCCM',
    roleGroupLabel: 'CCCM / ARMP / Tutelle (Préfecture / Gouvernorat)',
    title: '27. Avis motivé de la Commission Centrale de Contrôle des Marchés (Canevas 4)',
    legalBasis: 'CMP Art. 28-32 & Canevas 4 Recueil ARMP',
    officialRecueilRef: 'Canevas 4',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Autorité Contractante & MINMAP',
    lockedLegalClause:
      'Contrôle a priori de régularité portant sur le DCE, la proposition d’attribution ou le projet d’avenant dépassant les seuils CCCM.',
    adaptableBodyTemplate:
      "La Commission Centrale de Contrôle des Marchés émet un avis [FAVORABLE / FAVORABLE SOUS RÉSERVES / DÉFAVORABLE] sur le dossier {{project_code}} ({{project_title}}).",
    defaultAmpliations: ['MINMAP', 'ARMP', 'MO/MOD', 'CPM', 'Archives'],
  },
  {
    actCode: 'ACT_28_RAPPORT_OBSERVATEUR_INDEPENDANT',
    roleOwner: 'ARMP_OBSERVATEUR',
    roleGroupLabel: 'CCCM / ARMP / Tutelle (Préfecture / Gouvernorat)',
    title: '28. Rapport de l’Observateur Indépendant (Canevas 11 ARMP)',
    legalBasis: 'CMP Art. 35 & Canevas 11 Recueil ARMP',
    officialRecueilRef: 'Canevas 11',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'ARMP, MINMAP & Autorité Contractante',
    lockedLegalClause:
      'Relève en toute indépendance les éventuels dysfonctionnements procéduraux ou violations de l’égalité de traitement lors des travaux de la commission.',
    adaptableBodyTemplate:
      "Rapport d'observation de la procédure {{project_code}} ({{project_title}}) tenue au sein de {{commission_competente}}.",
    defaultAmpliations: ['ARMP', 'MINMAP', 'MO/MOD', 'Archives'],
  },
  {
    actCode: 'ACT_29_DECISION_CER_ARMP_CONTENTIEUX',
    roleOwner: 'ARMP_REGULATEUR',
    roleGroupLabel: 'CCCM / ARMP / Tutelle (Préfecture / Gouvernorat)',
    title: '29. Décision de suspension / Avis du Comité d’Examen des Recours (CER / ARMP)',
    legalBasis: 'CMP Art. 170-179',
    hierarchyDirection: 'DESCENDANT',
    defaultRecipientRank: 'Maître d’Ouvrage, Requérant & Commission',
    lockedLegalClause:
      'Vérifie la recevabilité du recours (délai, consignation de la caution de recours) et statue sur la régularité de la procédure contestée.',
    adaptableBodyTemplate:
      "Instruction et décision sur le recours introduit dans le cadre de la consultation {{project_code}} ({{project_title}}).",
    defaultAmpliations: ['MINMAP', 'MO/MOD', 'Requérant', 'CPM', 'Archives'],
  },
  {
    actCode: 'ACT_30_VISA_TUTELLE_PREFECTURE_GOUVERNORAT',
    roleOwner: 'TUTELLE_ETAT',
    roleGroupLabel: 'CCCM / ARMP / Tutelle (Préfecture / Gouvernorat)',
    title: '30. Acte d’approbation / Visa de Tutelle (Préfet / Gouverneur sur CTD)',
    legalBasis: 'Loi n° 2019/024 portant CGCTD & CMP Art. 13/16',
    hierarchyDirection: 'DESCENDANT',
    defaultRecipientRank: 'Maire / Exécutif Communal / Régional',
    lockedLegalClause:
      'Contrôle administratif de légalité exercé par le Représentant de l’État (Préfet de Département ou Gouverneur de Région) sur les actes budgétaires et contractuels des Collectivités Territoriales Décentralisées.',
    adaptableBodyTemplate:
      "Vu les textes régissant la tutelle de l'État sur les CTD et la commande publique, {{signer_title}} approuve / vise pour exécution l'acte relatif au dossier {{project_code}} ({{project_title}}) initié par {{entity_name}}.",
    defaultAmpliations: ['MINDDEVEL', 'MINMAP/DDMAP', 'ARMP', 'Receveur Municipal', 'Archives'],
  },

  // === V. CONTROLEUR FINANCIER & RECEVEUR (3 actes) ===
  {
    actCode: 'ACT_31_CERTIFICAT_DISPONIBILITE_CREDITS',
    roleOwner: 'CONTROLEUR_FINANCIER',
    roleGroupLabel: 'Contrôleur Financier & Receveur',
    title: '31. Attestation / Certificat de Disponibilité des Crédits budgétaires',
    legalBasis: 'Loi n° 2018/012 Régime Financier & CMP Art. 55',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Ordonnateur (MO / MOD) & CPM',
    lockedLegalClause:
      'Aucune consultation ne peut être lancée sans l’attestation préalable de disponibilité des crédits couvrant le coût prévisionnel du projet.',
    adaptableBodyTemplate:
      "Le Contrôleur Financier près {{entity_name}} certifie que les crédits nécessaires au financement du projet {{project_code}} ({{project_title}}) d'un montant de {{amount_ttc}} FCFA TTC sont disponibles sur la ligne budgétaire désignée ({{funding_label}}).",
    defaultAmpliations: ['MO/MOD', 'CPM', 'Archives'],
  },
  {
    actCode: 'ACT_32_VISA_BUDGETAIRE_CONTRAT_AVENANT',
    roleOwner: 'CONTROLEUR_FINANCIER',
    roleGroupLabel: 'Contrôleur Financier & Receveur',
    title: '32. Fiche de Visa budgétaire préalable (Marché / LC / Avenant)',
    legalBasis: 'Circulaire Exécution Budget MINFI & CMP',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Ordonnateur & Service des Marchés',
    lockedLegalClause:
      'Le visa financier vérifie l’imputation budgétaire exacte, l’exactitude des retenues fiscales (TVA 19,25 %, AIR selon régime) et l’absence de dépassement d’enveloppe.',
    adaptableBodyTemplate:
      "Visa financier accordé au projet de {{contract_type_label}} {{project_code}} conclu avec {{supplier_name}} pour {{amount_ttc}} FCFA TTC. {{fiscal_note}}",
    defaultAmpliations: ['MO/MOD', 'Receveur/Comptable Assignataire', 'Archives'],
  },
  {
    actCode: 'ACT_33_DECOMPTE_PROVISOIRE_DGD_MANDAT',
    roleOwner: 'RECEVEUR_COMPTABLE',
    roleGroupLabel: 'Contrôleur Financier & Receveur',
    title: '33. Décompte Provisoire / DGD / Liquidation (Docs 31-35 ARMP)',
    legalBasis: 'Documents 31 à 35 Recueil ARMP & CGI Cameroun',
    officialRecueilRef: 'Documents 31-35',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Ordonnateur, MINMAP (si DGD) & Titulaire',
    lockedLegalClause:
      'Déduction automatique des taxes applicables (TVA 19,25 %, AIR 2,2 % ou 5,5 %, retenue de garantie 10 % si non cautionnée, remboursement avance de démarrage et pénalités de retard).',
    adaptableBodyTemplate:
      "Décompte établi au profit de {{supplier_name}} au titre du marché {{project_code}} ({{project_title}}) — {{fiscal_note}}.",
    defaultAmpliations: ['MO/MOD', 'MINMAP (DGD)', 'Contrôleur Financier', 'Titulaire', 'Archives'],
  },

  // === VI. INGENIEUR & CHEF DE SERVICE (3 actes) ===
  {
    actCode: 'ACT_34_ORDRE_SERVICE_COMPLET',
    roleOwner: 'INGENIEUR_MARCHE',
    roleGroupLabel: 'Ingénieur & Chef de Service du Marché',
    title: '34. Ordre de Service (Démarrage / Arrêt / Reprise / Prix Nouveaux — Docs 16-20)',
    legalBasis: 'CCAG Art. 8 & Documents 16 à 20 Recueil ARMP',
    officialRecueilRef: 'Documents 16-20',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Entreprise Titulaire (avec récépissé daté et signé)',
    lockedLegalClause:
      'Tout Ordre de Service est daté, numéroté et enregistré. L’OS de démarrage déclenche le décompte du délai contractuel d’exécution à compter de sa date de notification au cocontractant.',
    adaptableBodyTemplate:
      "La société {{supplier_name}}, titulaire du {{contract_type_label}} {{project_code}} ({{project_title}}), est invitée à exécuter les prescriptions du présent Ordre de Service dans le délai contractuel de {{execution_days}} jours.",
    defaultAmpliations: ['MO/MOD', 'MINMAP', 'ARMP', 'Chef de Service', 'Titulaire', 'Archives'],
  },
  {
    actCode: 'ACT_35_ATTACHEMENT_ET_CONSTAT_CARENCE',
    roleOwner: 'INGENIEUR_MARCHE',
    roleGroupLabel: 'Ingénieur & Chef de Service du Marché',
    title: '35. Attachement contradictoire & Constat de carence / Journal chantier (Docs 21, 28-30)',
    legalBasis: 'Documents 21 & 28-30 Recueil ARMP',
    officialRecueilRef: 'Documents 21, 28-30',
    hierarchyDirection: 'EGALITAIRE',
    defaultRecipientRank: 'Chef de Service du Marché & Titulaire',
    lockedLegalClause:
      'Les quantités ouvrant droit à paiement doivent être constatées contradictoirement sur attachements signés par l’Ingénieur, le Maître d’Œuvre le cas échéant et l’Entreprise.',
    adaptableBodyTemplate:
      "Constat contradictoire des quantités exécutées sur le chantier {{project_code}} ({{project_title}}) par {{supplier_name}}.",
    defaultAmpliations: ['MO/MOD', 'Contrôleur Financier', 'Titulaire', 'Archives'],
  },
  {
    actCode: 'ACT_36_PV_RECEPTIONS_TECHNIQUE_PROVISOIRE_DEFINITIVE',
    roleOwner: 'CHEF_SERVICE_MARCHE',
    roleGroupLabel: 'Ingénieur & Chef de Service du Marché',
    title: '36. PV de Pré-réception / Réception Provisoire / Recette Technique / Définitive (Docs 23-27)',
    legalBasis: 'CMP Art. 149-153 & Documents 23 à 27 Recueil ARMP',
    officialRecueilRef: 'Documents 23-27',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Maître d’Ouvrage, MINMAP & Commission de Réception',
    lockedLegalClause:
      'La réception provisoire valide la conformité technique et déclenche la période de garantie (généralement 12 mois). La réception définitive intervient à l’expiration du délai de garantie après levée de toutes réserves.',
    adaptableBodyTemplate:
      "La Commission de Réception / Recette Technique s'est réunie pour constater l'exécution des prestations du projet {{project_code}} ({{project_title}}) réalisées par {{supplier_name}}.",
    defaultAmpliations: ['MO/MOD', 'MINMAP', 'ARMP', 'Contrôleur Financier', 'Titulaire', 'Archives'],
  },

  // === VII. SOUMISSIONNAIRE (8 actes) ===
  {
    actCode: 'ACT_37_LETTRE_SOUMISSION_TIMBREE',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '37. Lettre de soumission timbrée (Modèle officiel DTAO / DT-DC)',
    legalBasis: 'Pièce 11 DTAO ARMP & CGI (Droit de timbre)',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Monsieur/Madame l’Autorité Contractante',
    lockedLegalClause:
      'Doit être rédigée sur papier timbré au tarif en vigueur (timbre communal/fiscal), datée, signée par le mandataire habilité avec cachet officiel, portant engagement ferme pour 90 jours.',
    adaptableBodyTemplate:
      "Après avoir pris connaissance du Dossier de Consultation {{project_code}} ({{project_title}}), nous soussignés {{supplier_name}} (NIU : {{supplier_niu}}) nous engageons à exécuter les prestations pour la somme de {{amount_ttc}} FCFA TTC dans un délai de {{execution_days}} jours.",
    defaultAmpliations: ['Enveloppe C (Offre Financière)'],
  },
  {
    actCode: 'ACT_38_DECLARATION_HONNEUR_INTEGRITE',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '38. Déclaration sur l’honneur (Non-faillite, non-abandon & Charte d’intégrité)',
    legalBasis: 'CMP Art. 90 & RGAO Art. 6',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Autorité Contractante & CPM compétente',
    lockedLegalClause:
      'Toute fausse déclaration ou pièce falsifiée dans le dossier administratif entraîne le rejet automatique de l’offre et l’exclusion des marchés publics par l’ARMP.',
    adaptableBodyTemplate:
      "Je soussigné, représentant légal de {{supplier_name}} (NIU : {{supplier_niu}}), déclare sur l'honneur n'être en état ni de faillite, ni de liquidation, ni d'exclusion ARMP, et n'avoir abandonné aucun marché public au cours des trois dernières années.",
    defaultAmpliations: ['Enveloppe A (Dossier Administratif)'],
  },
  {
    actCode: 'ACT_39_DEMANDE_ECLAIRCISSEMENT_DAO',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '39. Demande d’éclaircissement sur le DAO / DC (RGAO)',
    legalBasis: 'RGAO Art. 8 (au moins 14 jours avant ouverture)',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Maître d’Ouvrage / Service SIGAMP',
    lockedLegalClause:
      'Doit être adressée par écrit dans le délai minimal fixé au RPAO avant la date limite de dépôt des offres ; la réponse écrite est diffusée sans révéler l’auteur à tous les acquéreurs.',
    adaptableBodyTemplate:
      "En qualité de candidat acquéreur du dossier {{project_code}} ({{project_title}}), {{supplier_name}} sollicite des éclaircissements techniques/administratifs sur les points précisés ci-après.",
    defaultAmpliations: ['Copie CPM'],
  },
  {
    actCode: 'ACT_40_RECOURS_GRACIEUX_OU_CER',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '40. Recours gracieux auprès du MO / Recours devant le CER (ARMP)',
    legalBasis: 'CMP Art. 170-176',
    hierarchyDirection: 'ASCENDANT',
    defaultRecipientRank: 'Maître d’Ouvrage / Président du CER (ARMP)',
    lockedLegalClause:
      'À peine d’irrecevabilité, le recours doit être introduit dans les délais légaux (5 jours ouvrables après publication résultats) et accompagné du reçu de consignation réglementaire auprès de la CDEC/ARMP.',
    adaptableBodyTemplate:
      "La société {{supplier_name}} conteste les conclusions publiées pour le dossier {{project_code}} ({{project_title}}) pour les motifs de droit et de fait exposés ci-dessous.",
    defaultAmpliations: ['MINMAP', 'ARMP', 'CPM'],
  },
  {
    actCode: 'ACT_41_DEMANDE_MAINLEVEE_ET_FACTURE',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '41. Demande de paiement / Facture normalisée & Demande de mainlevée de caution',
    legalBasis: 'CCAG & Document 33 Recueil ARMP',
    officialRecueilRef: 'Document 33',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Maître d’Ouvrage & Chef de Service du Marché',
    lockedLegalClause:
      'Toute facture doit comporter le NIU, le RCCM, les coordonnées bancaires exactes, le montant HT, la TVA et le Net à mandater.',
    adaptableBodyTemplate:
      "{{supplier_name}} (NIU : {{supplier_niu}}) soumet pour règlement et suite réglementaire sa demande relative au marché {{project_code}} ({{project_title}}).",
    defaultAmpliations: ['Ingénieur du Marché', 'Receveur'],
  },
  {
    actCode: 'ACT_42_MODELE_CAUTION_BANCAIRE_COBAC',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '42. Modèle de Cautionnement bancaire autonome OHADA / COBAC',
    legalBasis: 'Acte Uniforme OHADA Sûretés & Arrêté 093/CAB/PM',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Autorité Contractante (Bénéficiaire)',
    lockedLegalClause:
      'Garantie à première demande délivrée exclusivement par un établissement bancaire ou organisme financier de 1er rang agréé par le MINFI / COBAC.',
    adaptableBodyTemplate:
      "Modèle d'engagement bancaire autonome en faveur de {{entity_name}} pour le compte de {{supplier_name}} dans le cadre du projet {{project_code}} (Soumission / Bonne exécution / Avance / Retenue de garantie).",
    defaultAmpliations: ['Banque émettrice', 'Enveloppe A / Dossier contrat'],
  },
  {
    actCode: 'ACT_43_ATTESTATION_VISITE_SITE_ET_CAPACITE',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '43. Attestation sur l’honneur de visite de site & Capacité financière',
    legalBasis: 'RGAO Art. 7 & Pièce 11 DTAO',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Autorité Contractante & SCA',
    lockedLegalClause:
      'Confirme que le candidat a pris pleine connaissance des contraintes topographiques, climatiques et logistiques du site d’exécution.',
    adaptableBodyTemplate:
      "{{supplier_name}} certifie avoir visité le site du projet {{project_code}} ({{project_title}}) sis à {{city}} et dispose des capacités techniques et financières requises.",
    defaultAmpliations: ['Enveloppe B (Offre Technique)'],
  },
  {
    actCode: 'ACT_44_CONVENTION_GROUPEMENT_OHADA',
    roleOwner: 'SOUMISSIONNAIRE',
    roleGroupLabel: 'Soumissionnaire / Entreprise',
    title: '44. Modèle de Convention / Acte de Groupement (Conjoint ou Solidaire)',
    legalBasis: 'RGAO Art. 6.2 & Droit OHADA des Sociétés',
    hierarchyDirection: 'EXTERNE_TIERS',
    defaultRecipientRank: 'Autorité Contractante & Membres du Groupement',
    lockedLegalClause:
      'Désigne impérativement un Mandataire commun habilité à engager l’ensemble des membres du groupement et précise la solidarité conjointe ou solidaire.',
    adaptableBodyTemplate:
      "Convention de groupement constituée en vue de soumissionner au dossier {{project_code}} ({{project_title}}) lancé par {{entity_name}}, sous la conduite du mandataire {{supplier_name}}.",
    defaultAmpliations: ['Enveloppe A (Dossier Administratif)'],
  },
];

export function resolveContextAdaptations(ctx: ParametricAdaptationContext): {
  commissionCompetente: string;
  tutelleNote: string;
  fiscalNote: string;
  fundingLabel: string;
  contractTypeLabel: string;
  modeLabel: string;
  urgencyNote: string;
  timbreBlock: string;
} {
  let commissionCompetente = 'la Commission Interne de Passation des Marchés (CIPM)';
  if (ctx.entityType === 'PREFECTURE' || (ctx.entityType === 'COMMUNE' && !ctx.hasOwnCipm)) {
    commissionCompetente = ctx.parentTutelleName
      ? `la Commission Départementale de Passation des Marchés (CDPM) placée auprès de ${ctx.parentTutelleName}`
      : 'la Commission Départementale de Passation des Marchés (CDPM) placée auprès du Préfet';
  } else if (ctx.entityType === 'GOUVERNORAT' || ctx.entityType === 'REGION') {
    commissionCompetente = 'la Commission Régionale de Passation des Marchés (CRPM)';
  }

  let tutelleNote = '';
  if (ctx.entityType === 'COMMUNE' || ctx.entityType === 'COMMUNAUTE_URBAINE') {
    tutelleNote = ctx.parentTutelleName
      ? `Sous la tutelle administrative de ${ctx.parentTutelleName} (Loi n° 2019/024 portant CGCTD).`
      : 'Sous la tutelle du Représentant de l’État compétent (Préfet/Gouverneur).';
  } else if (ctx.entityType === 'PREFECTURE') {
    tutelleNote =
      'Agissant en qualité de Maître d’Ouvrage Délégué / Autorité de Tutelle et Ordonnateur de la CDPM (Art. 13 CMP).';
  } else if (ctx.entityType === 'GOUVERNORAT') {
    tutelleNote =
      'Agissant en qualité de Maître d’Ouvrage Délégué Régional et Ordonnateur de la CRPM (Art. 12 CMP).';
  }

  const airRate =
    ctx.fiscalRegime === 'REEL'
      ? '2,2 %'
      : ctx.fiscalRegime === 'SIMPLIFIE'
        ? '5,5 %'
        : ctx.fiscalRegime === 'ETRANGER_NON_RESIDENT'
          ? 'TSR 15 % (ou convention fiscale)'
          : 'Selon régime libératoire CGI';
  const fiscalNote = `TVA 19,25 % | AIR / Précompte (${ctx.fiscalRegime}) : ${airRate}`;

  const fundingLabels: Record<FundingSourceType, string> = {
    BIP_ETAT: "Budget d'Investissement Public (BIP)",
    BUDGET_COMMUNAL: 'Budget Communal / CTD',
    FEICOM: 'Financement FEICOM / Coopération Décentralisée',
    FONDS_ROUTIER: 'Fonds Routier du Cameroun',
    BAILLEUR_EXTERNE: 'Financement Extérieur (Convention PTF / Art. 50(3) CMP)',
  };

  const contractLabels: Record<ContractType, string> = {
    BON_COMMANDE_ADMINISTRATIF: 'Bon de Commande Administratif (BCA)',
    LETTRE_COMMANDE: 'Lettre-Commande',
    MARCHE: 'Marché Public',
  };

  const modeLabels: Record<ProcurementMode, string> = {
    AONO: "Appel d'Offres National Ouvert (AONO)",
    AOIO: "Appel d'Offres International Ouvert (AOIO)",
    AONR: "Appel d'Offres National Restreint (AONR)",
    AOIR: "Appel d'Offres International Restreint (AOIR)",
    ASMI: 'Appel à Manifestation d’Intérêt (ASMI)',
    DC_COTATION: 'Demande de Cotation (DC)',
    GRE_A_GRE: 'Procédure Exceptionnelle de Gré à Gré',
    REGIE: 'Exécution en Régie',
  };

  const urgencyNote = ctx.isUrgency
    ? "PROCÉDURE D'URGENCE ACTIVÉE : délais de publicité réduits conformément à l'article 87(2) du CMP."
    : 'Procédure ordinaire dans les délais normaux du CMP.';

  const timbreBlock = [
    'RÉPUBLIQUE DU CAMEROUN',
    'Paix - Travail - Patrie',
    '---------',
    ctx.entityName.toUpperCase(),
    `(${ctx.entityCode})`,
    '---------',
  ].join('\n');

  return {
    commissionCompetente,
    tutelleNote,
    fiscalNote,
    fundingLabel: fundingLabels[ctx.fundingSource],
    contractTypeLabel: contractLabels[ctx.contractType],
    modeLabel: modeLabels[ctx.procurementMode],
    urgencyNote,
    timbreBlock,
  };
}

export function renderParametricAct(
  actCode: string,
  ctx: ParametricAdaptationContext
): RenderedParametricAct {
  const act =
    PARAMETRIC_ACTS_CATALOG_44.find((a) => a.actCode === actCode) ??
    PARAMETRIC_ACTS_CATALOG_44[0]!;
  const resolved = resolveContextAdaptations(ctx);

  const vars: Record<string, string> = {
    entity_name: ctx.entityName,
    entity_code: ctx.entityCode,
    city: ctx.city,
    fiscal_year: String(ctx.fiscalYear),
    signer_title: ctx.signerTitle,
    signer_name: ctx.signerName,
    project_code: ctx.projectCode,
    project_title: ctx.projectTitle,
    amount_ttc: Math.round(ctx.amountTtcFcfa).toLocaleString('fr-FR'),
    execution_days: String(ctx.executionDays),
    supplier_name: ctx.supplierName || '[À DÉSIGNER / TITULAIRE]',
    supplier_niu: ctx.supplierNiu || '[NIU À RENSEIGNER]',
    commission_competente: resolved.commissionCompetente,
    tutelle_note: resolved.tutelleNote,
    fiscal_note: resolved.fiscalNote,
    funding_label: resolved.fundingLabel,
    contract_type_label: resolved.contractTypeLabel,
    mode_label: resolved.modeLabel,
    urgency_note: resolved.urgencyNote,
  };

  let adaptableBody = ctx.customAdaptableClause?.trim()
    ? ctx.customAdaptableClause
    : act.adaptableBodyTemplate;
  for (const [k, v] of Object.entries(vars)) {
    adaptableBody = adaptableBody.replaceAll(`{{${k}}}`, v);
  }
  if (ctx.isMultiLot && ctx.lotSummary) {
    adaptableBody += `\n\nAllotissement : ${ctx.lotSummary}`;
  }

  const subject = `${act.title.replace(/^\d+\.\s*/, '')} — ${ctx.projectCode} : ${ctx.projectTitle}`;
  const fullDocumentText = [
    resolved.timbreBlock,
    `N° ${ctx.chronoNumber}          ${ctx.city}, le ${ctx.dateFormatted}`,
    '',
    `DESTINATAIRE : ${ctx.recipientLabel || act.defaultRecipientRank}`,
    `OBJET : ${subject}`,
    `RÉF. JURIDIQUE : ${act.legalBasis}`,
    '',
    '--- DISPOSITIONS RÉGLEMENTAIRES VERROUILLÉES (ORDRE PUBLIC) ---',
    act.lockedLegalClause,
    '',
    '--- CORPS ADAPTÉ AU CONTEXTE DU DOSSIER ---',
    adaptableBody,
    '',
    `${ctx.signerTitle}`,
    ctx.signerName,
    '',
    `AMPLIATIONS :\n${act.defaultAmpliations.map((a) => `- ${a}`).join('\n')}`,
  ].join('\n');

  return {
    act,
    timbreBlock: resolved.timbreBlock,
    commissionCompetente: resolved.commissionCompetente,
    tutelleVisaNote: resolved.tutelleNote,
    fiscalNote: resolved.fiscalNote,
    subject,
    lockedSection: act.lockedLegalClause,
    adaptableSection: adaptableBody,
    fullDocumentText,
    ampliations: act.defaultAmpliations,
  };
}
