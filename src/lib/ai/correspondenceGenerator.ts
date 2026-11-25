import type {
  CorrespondenceCaseType,
  CorrespondenceSqlContext,
  CorrespondenceTemplateRecord,
  GeneratedCorrespondenceResult,
  GenerateCorrespondenceInput,
  HierarchyDirection,
  LearnedTemplateProposal,
  LearnTemplateInput,
} from '../../types/ai';
import { invokeAiGateway, type GatewayRuntimeOptions } from './aiGateway';
import { ADMINISTRATIVE_WRITER_SYSTEM_PROMPT } from './legalPrompts';

/**
 * Moteur 3 (Jalon 3) : Rédaction Administrative Camerounaise & Apprentissage de Modèles
 * - Structure protocolaire camerounaise : Timbre, N° Chrono, Références, Objet, Formules hiérarchiques, Ampliations
 * - Injection déterministe des variables SQL du dossier
 * - Capitalisation / apprentissage automatique des meilleurs documents validés comme modèles par rôle et par cas
 */

export function formatFcfaAmount(amount?: number): string {
  if (amount === undefined || !Number.isFinite(amount)) return '—';
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
}

export function resolveHierarchySalutation(direction: HierarchyDirection): {
  openingVerb: string;
  closingFormula: string;
} {
  switch (direction) {
    case 'ASCENDANT':
      return {
        openingVerb: "J'ai l'honneur de soumettre à votre haute appréciation",
        closingFormula:
          "Je vous prie de bien vouloir agréer, Monsieur/Madame, l'expression de ma très haute considération.",
      };
    case 'EGALITAIRE':
      return {
        openingVerb: "J'ai l'honneur de vous transmettre",
        closingFormula:
          "Je vous prie d'agréer l'assurance de ma considération distinguée.",
      };
    case 'DESCENDANT':
      return {
        openingVerb: 'Je vous invite à bien vouloir prendre les dispositions relatives à',
        closingFormula: "J'attache du prix au strict respect des présentes instructions.",
      };
    case 'EXTERNE_TIERS':
      return {
        openingVerb: "J'ai l'honneur de porter à votre connaissance",
        closingFormula:
          "Veuillez agréer, Monsieur/Madame le Directeur Général, l'expression de ma considération distinguée.",
      };
  }
}

function buildAttachmentsTableText(
  attachments?: CorrespondenceSqlContext['attachmentsList']
): string {
  if (!attachments || attachments.length === 0) {
    return '1. Dossier complet du marché concerné | Nombre : 01 | Observation : Pour examen et suite à donner.';
  }
  return attachments
    .map(
      (att, idx) =>
        `${idx + 1}. ${att.designation} | Nombre de pièces : ${String(att.copiesCount).padStart(
          2,
          '0'
        )} | Observations : ${att.observations ?? 'Pour suite à donner'}`
    )
    .join('\n');
}

export const DEFAULT_NATIONAL_TEMPLATES: CorrespondenceTemplateRecord[] = [
  {
    id: 'nat-bt-001',
    entityId: null,
    roleOwner: 'SIGAMP',
    caseType: 'BORDEREAU_TRANSMISSION',
    title: 'Bordereau de Transmission Officiel (DAO / Rapport SCA / Dossier)',
    administrativeRankTarget: 'Président CIPM / CCCM / Contrôleur Financier',
    hierarchyDirection: 'EGALITAIRE',
    subjectTemplate:
      'Transmission du dossier relatif au projet {{project_code}} — {{project_title}}',
    bodyTemplate: `{{opening_verb}} pour compétence, examen et suite réglementaire, les pièces ci-après désignées relatives à l'opération « {{project_title}} » (Réf. : {{project_code}}, Exercice {{fiscal_year}}) :

{{attachments_table}}

Montant prévisionnel / contractuel TTC : {{amount_ttc_formatted}}
Mode de passation retenu : {{procurement_mode}} — Commission compétente : {{commission_type}}.

{{closing_formula}}`,
    defaultAmpliations: [
      'Maître d’Ouvrage (ATCR)',
      'Président de la Commission des Marchés',
      'Observateur Indépendant / ARMP',
      'Chrono / Archives SIGAMP',
    ],
    variablesSchema: [
      'project_code',
      'project_title',
      'fiscal_year',
      'attachments_table',
      'amount_ttc_formatted',
      'procurement_mode',
      'commission_type',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics',
      'Décret n° 2013/271 du 05 août 2013 relatif aux Commissions de Passation des Marchés',
    ],
    isValidatedBestPractice: true,
    usageCount: 100,
  },
  {
    id: 'nat-note-001',
    entityId: null,
    roleOwner: 'SIGAMP',
    caseType: 'NOTE_INFORMATION',
    title: "Note d'Information / Note de Synthèse Procédurale",
    administrativeRankTarget: "Maître d'Ouvrage / Tutelle / ACMP",
    hierarchyDirection: 'ASCENDANT',
    subjectTemplate:
      "Note d'information relative au dossier {{project_code}} ({{contract_number}})",
    bodyTemplate: `{{opening_verb}} la présente note de synthèse portant sur l'état d'avancement du dossier « {{project_title}} » (Code : {{project_code}}).

1. CONTEXTE ET CADRE JURIDIQUE :
L'opération, inscrite au budget de l'exercice {{fiscal_year}} pour un montant de {{amount_ttc_formatted}}, relève du mode {{procurement_mode}} sous le contrôle de la {{commission_type}}.

2. POINT DE SITUATION :
{{reference_document}}

3. PROPOSITION D'ORIENTATION :
Conformément aux dispositions du Décret n° 2018/366 du 20 juin 2018, il est sollicité votre accord pour la poursuite de la procédure selon les recommandations techniques ci-jointes.

{{closing_formula}}`,
    defaultAmpliations: ['Secrétariat Général', 'SIGAMP', 'Contrôle Financier', 'Chrono'],
    variablesSchema: [
      'project_code',
      'project_title',
      'contract_number',
      'fiscal_year',
      'amount_ttc_formatted',
      'procurement_mode',
      'commission_type',
      'reference_document',
    ],
    legalCitations: ['Décret n° 2018/366 du 20 juin 2018 (CMP)'],
    isValidatedBestPractice: true,
    usageCount: 70,
  },
  {
    id: 'nat-os-001',
    entityId: null,
    roleOwner: 'MO_MOD',
    caseType: 'ORDRE_SERVICE',
    title: "Ordre de Service (Démarrage / Arrêt / Reprise d'Exécution)",
    administrativeRankTarget: 'Entreprise Titulaire',
    hierarchyDirection: 'EXTERNE_TIERS',
    subjectTemplate:
      'Ordre de Service — Marché/LC n° {{contract_number}} ({{project_title}})',
    bodyTemplate: `Le présent Ordre de Service est notifié à l'entreprise {{supplier_name}} (NIU : {{supplier_niu}}), titulaire du contrat n° {{contract_number}} relatif à « {{project_title}} », d'un montant de {{amount_ttc_formatted}}.

Article 1 : Il est prescrit au Titulaire de prendre toutes dispositions pour exécuter les prescriptions techniques conformément au Cahier des Clauses Administratives Particulières (CCAP) et au Cahier des Clauses Techniques Particulières (CCTP).
Article 2 : Le délai contractuel d'exécution est fixé à {{execution_days}} jours calendaires à compter de la date de notification du présent Ordre de Service (échéance prévisionnelle : {{deadline_date}}).
Article 3 : L'Ingénieur du Marché et le Chef de Service du Marché sont chargés du suivi rigoureux de l'exécution et de la tenue des attachements contradictoires.

{{closing_formula}}`,
    defaultAmpliations: [
      'MINMAP (Délégation compétente)',
      'ARMP',
      'Ingénieur du Marché',
      'Chef de Service du Marché',
      'Contrôleur Financier',
      'Entreprise Titulaire (pour notification)',
      'Chrono',
    ],
    variablesSchema: [
      'contract_number',
      'project_title',
      'supplier_name',
      'supplier_niu',
      'amount_ttc_formatted',
      'execution_days',
      'deadline_date',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 — Exécution des marchés publics',
    ],
    isValidatedBestPractice: true,
    usageCount: 90,
  },
  {
    id: 'nat-med-001',
    entityId: null,
    roleOwner: 'MO_MOD',
    caseType: 'MISE_EN_DEMEURE',
    title: 'Ordre de Service portant Mise en Demeure (15 à 21 jours)',
    administrativeRankTarget: 'Entreprise Titulaire Défaillante',
    hierarchyDirection: 'EXTERNE_TIERS',
    subjectTemplate:
      'MISE EN DEMEURE — Marché/LC n° {{contract_number}} ({{supplier_name}})',
    bodyTemplate: `Vu le contrat n° {{contract_number}} d'un montant de {{amount_ttc_formatted}} attribué à votre entreprise {{supplier_name}} pour « {{project_title}} » ;
Vu les constats de carence et retards injustifiés établis par l'Ingénieur du Marché ({{reference_document}}) ;

En application des dispositions du Code des Marchés Publics (Décret n° 2018/366 du 20 juin 2018) et du Cahier des Clauses Administratives Particulières (CCAP), vous êtes formellement MIS EN DEMEURE de remédier intégralement aux manquements constatés et de reprendre l'exécution normale des prestations dans un délai impératif de {{grace_period_days}} jours calendaires à compter de la notification de la présente (soit au plus tard le {{deadline_date}}).

Faute pour votre entreprise de s'exécuter dans le délai prescrit, le Maître d'Ouvrage procédera de plein droit, sans autre avis préalable :
1. À l'application des pénalités de retard réglementaires plafonnées à 10% ;
2. À la résiliation du contrat à vos torts exclusifs avec confiscation du cautionnement de bonne exécution ;
3. À la saisine de l'ARMP aux fins de sanction et d'exclusion de la commande publique.

{{closing_formula}}`,
    defaultAmpliations: [
      'MINMAP',
      'ARMP',
      'Contrôleur Financier',
      'Ingénieur du Marché',
      'Garant / Banque émettrice de la caution',
      'Chrono',
    ],
    variablesSchema: [
      'contract_number',
      'amount_ttc_formatted',
      'supplier_name',
      'project_title',
      'reference_document',
      'grace_period_days',
      'deadline_date',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 — Mise en demeure (15 à 21 jours) et Résiliation',
      'Circulaire n° 00000001/PR/MINMAP/CAB relative aux sanctions',
    ],
    isValidatedBestPractice: true,
    usageCount: 85,
  },
  {
    id: 'nat-notif-attr-001',
    entityId: null,
    roleOwner: 'MO_MOD',
    caseType: 'NOTIFICATION_ATTRIBUTION',
    title: "Notification d'Attribution Provisoire / Définitive",
    administrativeRankTarget: 'Soumissionnaire Attributaire',
    hierarchyDirection: 'EXTERNE_TIERS',
    subjectTemplate:
      "Notification d'attribution — Dossier {{project_code}} ({{project_title}})",
    bodyTemplate: `{{opening_verb}} que, sur proposition de la {{commission_type}} et sous réserve des voies de recours réglementaires dans un délai de cinq (05) jours ouvrables à compter de la publication des résultats, votre entreprise {{supplier_name}} est retenue comme attributaire du dossier « {{project_title}} » (Réf. : {{project_code}}) pour un montant de {{amount_ttc_formatted}} et un délai d'exécution de {{execution_days}} jours.

Vous êtes invité à prendre attache avec le SIGAMP pour la mise au point du projet de contrat, la production de la caution définitive de bonne exécution et l'accomplissement des formalités d'enregistrement fiscal (DE 2%).

{{closing_formula}}`,
    defaultAmpliations: ['MINMAP', 'ARMP', 'Président Commission des Marchés', 'SIGAMP', 'Chrono'],
    variablesSchema: [
      'commission_type',
      'supplier_name',
      'project_title',
      'project_code',
      'amount_ttc_formatted',
      'execution_days',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 — Publication des résultats & délai de standstill (5 jours ouvrables)',
    ],
    isValidatedBestPractice: true,
    usageCount: 95,
  },
  {
    id: 'nat-notif-rejet-001',
    entityId: null,
    roleOwner: 'MO_MOD',
    caseType: 'NOTIFICATION_REJET',
    title: 'Notification Motivée de Rejet de Soumission',
    administrativeRankTarget: 'Soumissionnaire Non Retenu',
    hierarchyDirection: 'EXTERNE_TIERS',
    subjectTemplate:
      "Notification de rejet de votre offre — Dossier {{project_code}} ({{project_title}})",
    bodyTemplate: `{{opening_verb}} que, suite aux travaux d'analyse de la Sous-Commission d'Analyse (SCA) et aux délibérations de la {{commission_type}}, votre offre soumise pour le dossier « {{project_title}} » (Réf. : {{project_code}}) n'a pas été retenue pour le(s) motif(s) suivant(s) :
{{reference_document}}

Conformément aux dispositions du Code des Marchés Publics, vous disposez d'un délai de cinq (05) jours ouvrables à compter de la publication des résultats pour introduire, le cas échéant, un recours gracieux motivé auprès du Maître d'Ouvrage, avec copie à l'ARMP.

{{closing_formula}}`,
    defaultAmpliations: ['ARMP', 'Président Commission des Marchés', 'SIGAMP', 'Chrono'],
    variablesSchema: [
      'commission_type',
      'project_title',
      'project_code',
      'reference_document',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 — Motivation des rejets & délai de recours (5 jours ouvrables)',
    ],
    isValidatedBestPractice: true,
    usageCount: 80,
  },
  {
    id: 'nat-rep-recours-001',
    entityId: null,
    roleOwner: 'MO_MOD',
    caseType: 'REPONSE_RECOURS_MO',
    title: "Réponse Motivée du Maître d'Ouvrage à un Recours Préalable",
    administrativeRankTarget: 'Soumissionnaire Requérant',
    hierarchyDirection: 'EXTERNE_TIERS',
    subjectTemplate:
      'Réponse à votre recours n° {{dispute_number}} — Dossier {{project_code}}',
    bodyTemplate: `J'accuse réception de votre requête enregistrée sous le n° {{dispute_number}} relative à la procédure « {{project_title}} » (Réf. : {{project_code}}).

Après vérification des pièces du dossier (Procès-verbal d'ouverture des plis et Rapport d'analyse de la SCA) et examen de vos griefs au regard du Décret n° 2018/366 du 20 juin 2018 :

{{reference_document}}

Par conséquent, vous êtes informé de la décision motivée ci-dessus. Le cas échéant, vous conservez la faculté de saisir le Comité de Règlement des Différends près l'ARMP dans les formes et délais prescrits par la réglementation en vigueur.

{{closing_formula}}`,
    defaultAmpliations: ['DG ARMP (Comité de Règlement des Différends)', 'MINMAP', 'Président CPM', 'Chrono'],
    variablesSchema: [
      'dispute_number',
      'project_title',
      'project_code',
      'reference_document',
    ],
    legalCitations: [
      'Décret n° 2018/366 du 20 juin 2018 — Contentieux de la passation et recours préalable',
    ],
    isValidatedBestPractice: true,
    usageCount: 65,
  },
  {
    id: 'nat-etat-indemn-001',
    entityId: null,
    roleOwner: 'SIGAMP',
    caseType: 'ETAT_INDEMNITES',
    title: "Note de Transmission d'État Liquidatif des Indemnités de Session",
    administrativeRankTarget: 'Contrôleur Financier / Ordonnateur',
    hierarchyDirection: 'ASCENDANT',
    subjectTemplate:
      "Liquidation des indemnités de session — {{project_code}} ({{commission_type}})",
    bodyTemplate: `{{opening_verb}} pour visa financier et ordonnancement, l'état liquidatif des indemnités de session établi sur la base des feuilles de présence dûment émargées et du barème réglementaire en vigueur pour le dossier {{project_code}}.

Montant brut total liquidé : {{amount_ttc_formatted}}
Les pièces justificatives (feuille de présence certifiée, copie de l'acte validé et fiche d'engagement budgétaire) sont jointes en annexe :
{{attachments_table}}

{{closing_formula}}`,
    defaultAmpliations: [
      'Contrôleur Financier',
      'Receveur / Agent Comptable',
      'Président Commission des Marchés',
      'Chrono',
    ],
    variablesSchema: [
      'project_code',
      'commission_type',
      'amount_ttc_formatted',
      'attachments_table',
    ],
    legalCitations: [
      'Décret fixant les barèmes des indemnités de session des Commissions des Marchés et SCA',
    ],
    isValidatedBestPractice: true,
    usageCount: 75,
  },
];

export function selectBestTemplate(params: {
  entityId: string;
  roleOwner: string;
  caseType: CorrespondenceCaseType;
  catalog?: CorrespondenceTemplateRecord[];
}): CorrespondenceTemplateRecord {
  const pool = [...(params.catalog ?? []), ...DEFAULT_NATIONAL_TEMPLATES].filter(
    (t) => t.caseType === params.caseType
  );

  if (pool.length === 0) {
    return DEFAULT_NATIONAL_TEMPLATES[1]!; // NOTE_INFORMATION fallback
  }

  pool.sort((a, b) => {
    const scoreA =
      (a.entityId === params.entityId ? 1000 : a.entityId === null ? 100 : 0) +
      (a.isValidatedBestPractice ? 200 : 0) +
      (a.roleOwner === params.roleOwner ? 50 : 0) +
      Math.min(a.usageCount, 500);
    const scoreB =
      (b.entityId === params.entityId ? 1000 : b.entityId === null ? 100 : 0) +
      (b.isValidatedBestPractice ? 200 : 0) +
      (b.roleOwner === params.roleOwner ? 50 : 0) +
      Math.min(b.usageCount, 500);
    return scoreB - scoreA;
  });

  return pool[0]!;
}

export function buildSqlVariablesMap(
  sql: CorrespondenceSqlContext,
  direction: HierarchyDirection
): Record<string, string> {
  const salutation = resolveHierarchySalutation(direction);
  const baseMap: Record<string, string> = {
    project_code: sql.projectCode ?? '[CODE_PROJET]',
    project_title: sql.projectTitle ?? '[INTITULE_PROJET]',
    fiscal_year: sql.fiscalYear !== undefined ? String(sql.fiscalYear) : '[EXERCICE]',
    contract_number: sql.contractNumber ?? '[N_CONTRAT]',
    contract_type: sql.contractType ?? 'MARCHE',
    procurement_mode: sql.procurementMode ?? 'AONO',
    nature: sql.nature ?? 'TRAVAUX',
    commission_type: sql.commissionType ?? 'CIPM',
    supplier_name: sql.supplierName ?? '[RAISON_SOCIALE_TITULAIRE]',
    supplier_niu: sql.supplierNiu ?? '[NIU_NON_RENSEIGNE]',
    amount_ht_formatted: formatFcfaAmount(sql.amountHtFcfa),
    amount_ttc_formatted: formatFcfaAmount(sql.amountTtcFcfa),
    execution_days: sql.executionDays !== undefined ? String(sql.executionDays) : '[DELAI_JOURS]',
    deadline_date: sql.deadlineDateFormatted ?? '[DATE_ECHEANCE]',
    grace_period_days:
      sql.gracePeriodDays !== undefined ? String(sql.gracePeriodDays) : '15',
    dispute_number: sql.disputeNumber ?? '[N_RECOURS]',
    reference_document:
      sql.referenceDocument ?? 'Pièces constitutives du dossier administratif et technique.',
    attachments_table: buildAttachmentsTableText(sql.attachmentsList),
    opening_verb: salutation.openingVerb,
    closing_formula: salutation.closingFormula,
  };

  if (sql.customVariables) {
    for (const [key, value] of Object.entries(sql.customVariables)) {
      baseMap[key] = String(value);
    }
  }
  return baseMap;
}

export function injectTemplateVariables(
  templateText: string,
  variables: Record<string, string>
): string {
  return templateText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    return key in variables ? variables[key]! : `{{${key}}}`;
  });
}

function buildTimbreBlock(input: GenerateCorrespondenceInput): string {
  const { header } = input;
  const republic = header.republicHeader ?? 'RÉPUBLIQUE DU CAMEROUN';
  const motto = header.motto ?? 'Paix – Travail – Patrie';
  return [
    `${republic}                          ${header.city}, le ${header.dateFormatted}`,
    `${motto}`,
    '------------------',
    header.entityName.toUpperCase(),
    header.serviceLine,
    '------------------',
    `N° ${header.chronoNumber}`,
  ].join('\n');
}

export async function generateAdministrativeCorrespondence(
  input: GenerateCorrespondenceInput,
  gatewayRuntime?: GatewayRuntimeOptions
): Promise<GeneratedCorrespondenceResult> {
  const template = selectBestTemplate({
    entityId: input.entityId,
    roleOwner: input.header.senderRole,
    caseType: input.caseType,
    catalog: input.templatesCatalog,
  });

  const direction = input.header.hierarchyDirection ?? template.hierarchyDirection;
  const variables = buildSqlVariablesMap(input.sqlContext, direction);

  const subject = injectTemplateVariables(template.subjectTemplate, variables);
  let bodyRendered = injectTemplateVariables(template.bodyTemplate, variables);
  let aiRefined = false;
  let aiProviderUsed: GeneratedCorrespondenceResult['aiProviderUsed'];

  if (input.useAiRefinement) {
    try {
      const prompt = [
        `Type d'acte : ${input.caseType}`,
        `Destinataire : ${input.header.recipientLabel} (${input.header.recipientRank})`,
        `Direction hiérarchique : ${direction}`,
        `Objet : ${subject}`,
        input.customInstructions ? `Consignes spécifiques : ${input.customInstructions}` : '',
        `\nBrouillon pré-rempli avec données SQL (NE MODIFIE AUCUN CHIFFRE, DATE OU REFERENCE) :\n${bodyRendered}`,
        `\nAméliore uniquement la fluidité et la rigueur rédactionnelle administrative camerounaise et renvoie uniquement le corps du texte.`,
      ]
        .filter(Boolean)
        .join('\n');

      const aiResp = await invokeAiGateway(
        {
          taskKind: input.offlineMode ? 'OFFLINE_LOCAL' : 'FRANCOPHONE_DRAFTING',
          offlineMode: input.offlineMode,
          messages: [
            { role: 'system', content: ADMINISTRATIVE_WRITER_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.15,
          maxTokens: 1800,
        },
        gatewayRuntime
      );

      if (aiResp.content.trim().length > 40) {
        bodyRendered = aiResp.content.trim();
        aiRefined = true;
        aiProviderUsed = aiResp.providerUsed;
      }
    } catch {
      // Conservation silencieuse du brouillon déterministe en cas d'indisponibilité IA
      aiRefined = false;
    }
  }

  const timbreBlock = buildTimbreBlock(input);
  const recipientBlock = [
    `${input.header.senderTitle}`,
    'À',
    `${input.header.recipientLabel}`,
    `(${input.header.recipientRank})`,
  ].join('\n');

  const referencesList = [
    input.sqlContext.projectCode ? `Dossier n° ${input.sqlContext.projectCode}` : null,
    input.sqlContext.contractNumber ? `Contrat n° ${input.sqlContext.contractNumber}` : null,
    input.sqlContext.disputeNumber ? `Recours n° ${input.sqlContext.disputeNumber}` : null,
    input.sqlContext.referenceDocument ?? null,
    ...template.legalCitations,
  ].filter((x): x is string => Boolean(x));

  const ampliations = template.defaultAmpliations;

  const fullFormattedDocument = [
    timbreBlock,
    '',
    recipientBlock,
    '',
    `Réf. : ${referencesList.slice(0, 3).join(' ; ')}`,
    `Objet : ${subject}`,
    '',
    bodyRendered,
    '',
    `                                        Fait à ${input.header.city}, le ${input.header.dateFormatted}`,
    `                                        ${input.header.senderTitle}`,
    `                                        ${input.header.senderName}`,
    '',
    'Ampliations :',
    ...ampliations.map((a) => ` - ${a}`),
  ].join('\n');

  return {
    templateUsedId: template.id,
    caseType: input.caseType,
    chronoNumber: input.header.chronoNumber,
    timbreBlock,
    recipientBlock,
    referencesList,
    subject,
    bodyRendered,
    fullFormattedDocument,
    ampliations,
    legalCitations: template.legalCitations,
    injectedVariables: variables,
    aiRefined,
    aiProviderUsed,
  };
}

// ============================================================================
// MOTEUR D'APPRENTISSAGE & CAPITALISATION DES MODELES VALIDES
// ============================================================================

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection += 1;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function learnTemplateFromValidatedDocument(
  input: LearnTemplateInput
): LearnedTemplateProposal {
  const variablesMap = buildSqlVariablesMap(input.sqlContextUsed, input.hierarchyDirection);

  // Remplacer les valeurs spécifiques du dossier par leurs variables normalisées {{...}}
  // On exclut opening_verb et closing_formula pour les remplacer proprement aussi
  const replacements: Array<[string, string]> = [];
  for (const [varName, rawVal] of Object.entries(variablesMap)) {
    if (
      rawVal &&
      rawVal !== '—' &&
      !rawVal.startsWith('[') &&
      rawVal.length >= 3 &&
      varName !== 'attachments_table'
    ) {
      replacements.push([varName, rawVal]);
    }
  }
  // Trier par longueur décroissante pour éviter les remplacements partiels
  replacements.sort((a, b) => b[1].length - a[1].length);

  let generalizedSubject = input.validatedSubject;
  let generalizedBody = input.validatedBody;
  const extractedPlaceholders = new Set<string>();

  for (const [varName, rawVal] of replacements) {
    const regex = new RegExp(escapeRegExp(rawVal), 'g');
    if (regex.test(generalizedSubject)) {
      generalizedSubject = generalizedSubject.replace(regex, `{{${varName}}}`);
      extractedPlaceholders.add(varName);
    }
    if (regex.test(generalizedBody)) {
      generalizedBody = generalizedBody.replace(regex, `{{${varName}}}`);
      extractedPlaceholders.add(varName);
    }
  }

  // Vérifier s'il existe déjà un modèle quasi-identique pour cette entité / rôle / cas
  const similarExisting = (input.existingTemplates ?? []).find(
    (t) =>
      t.caseType === input.caseType &&
      t.roleOwner === input.roleOwner &&
      (t.entityId === input.entityId || t.entityId === null) &&
      jaccardSimilarity(t.bodyTemplate, generalizedBody) >= 0.88
  );

  const templateId = similarExisting
    ? similarExisting.id
    : `learned-${input.caseType.toLowerCase()}-${Date.now()}`;

  const proposedTemplate: CorrespondenceTemplateRecord = {
    id: templateId,
    entityId: input.entityId,
    roleOwner: input.roleOwner,
    caseType: input.caseType,
    title: `${input.caseType} — Modèle capitalisé (${input.roleOwner})`,
    administrativeRankTarget: input.administrativeRankTarget,
    hierarchyDirection: input.hierarchyDirection,
    subjectTemplate: generalizedSubject,
    bodyTemplate: generalizedBody,
    defaultAmpliations: input.defaultAmpliations ?? [
      'MINMAP',
      'ARMP',
      'Contrôleur Financier',
      'Chrono',
    ],
    variablesSchema: Array.from(extractedPlaceholders),
    legalCitations: input.legalCitations ?? [
      'Décret n° 2018/366 du 20 juin 2018 (CMP)',
    ],
    isValidatedBestPractice: true,
    usageCount: similarExisting ? similarExisting.usageCount + 1 : 1,
  };

  return {
    shouldPersist: !similarExisting,
    reason: similarExisting
      ? `Un modèle validé similaire (${similarExisting.id}) existe déjà : incrémenter son compteur d'usage.`
      : `Nouveau modèle réutilisable extrait avec ${extractedPlaceholders.size} variable(s) SQL paramétrée(s).`,
    template: proposedTemplate,
    extractedPlaceholders: Array.from(extractedPlaceholders),
  };
}
