import type {
  AgenticWorkflowResult,
  AiChatMessage,
  AiToolCallRequest,
  AiToolDefinition,
  AiToolExecutionContext,
  AiToolExecutionResult,
  CorrespondenceCaseType,
  HierarchyDirection,
} from '../../types/ai';
import type {
  CommissionType,
  ContractType,
  FiscalRegime,
  IndemnityTriggerEvent,
  ProcurementMode,
  ProcurementNature,
  RbacRole,
} from '../../types/domain';
import {
  calculateDecompte,
  calculateDelayPenalties,
} from '../domain/billingEngine';
import {
  evaluateAmendment,
  evaluateMiseEnDemeure,
} from '../domain/exceptionsEngine';
import {
  calculateIndemnityLiquidation,
  type BudgetLineSnapshot,
  type IndemnityScale,
  type SessionAttendanceRecord,
} from '../domain/indemnityEngine';
import {
  calculateLegalTimeline,
  evaluateAddendumExtension,
  routeProcurementProcedure,
} from '../domain/procurementRouter';
import { searchLocalLegalCorpus } from '../legal/cameroonLegalCorpus';
import { invokeAiGateway, type GatewayRuntimeOptions } from './aiGateway';
import { generateAdministrativeCorrespondence } from './correspondenceGenerator';
import { formatLegalRagContext, NLP_COPILOT_SYSTEM_PROMPT } from './legalPrompts';

/**
 * Moteur 2 (Jalon 3) : Agentic Workflow & Function Calling
 * Permet de piloter l'application en langage naturel tout en garantissant
 * que chaque calcul financier, délai ou verrou juridique passe par les moteurs déterministes (Jalon 2).
 */

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: 'create_procurement_project',
    description:
      'Crée un nouveau projet de commande publique et calcule automatiquement le routage CMP (type de contrat, mode de passation, commission CIPM/CRPM/CDPM, seuil CCCM, contrôle de légalité CTD).',
    parameters: {
      type: 'object',
      properties: {
        projectCode: {
          type: 'string',
          description: 'Code unique du projet (ex: PRJ-2026-042).',
        },
        title: {
          type: 'string',
          description: "Intitulé officiel de l'opération.",
        },
        nature: {
          type: 'string',
          enum: [
            'TRAVAUX',
            'FOURNITURES',
            'SERVICES_QUANTIFIABLES',
            'PRESTATIONS_INTELLECTUELLES',
          ],
          description: 'Nature de la prestation selon le CMP.',
        },
        estimatedAmountTtc: {
          type: 'number',
          description: 'Montant prévisionnel TTC en FCFA (strictement positif).',
        },
        isInternational: {
          type: 'boolean',
          description: 'Vrai si appel d’offres international.',
        },
        isRestricted: {
          type: 'boolean',
          description: 'Vrai si appel d’offres restreint.',
        },
        isGreAGreRequested: {
          type: 'boolean',
          description: 'Vrai si demande d’entente directe (Gré à Gré).',
        },
        greAGreJustification: {
          type: 'string',
          enum: ['URGENCE_IMPERIEUSE', 'MONOPOLE_BREVET', 'SECRET_DEFENSE', 'CARENCE_REPRISE'],
          description: 'Justification légale obligatoire en cas de Gré à Gré.',
        },
        isUrgent: {
          type: 'boolean',
          description: 'Vrai si procédure d’urgence réduisant les délais de publicité.',
        },
      },
      required: ['projectCode', 'title', 'nature', 'estimatedAmountTtc'],
    },
  },
  {
    name: 'launch_tender_dao',
    description:
      "Lance ou planifie un Dossier d'Appel d'Offres (DAO) : calcule le rétroplanning légal (dépôt, ouverture, validité 90 jours, standstill 5 jours ouvrables) et contrôle les éventuels additifs (< 7 jours).",
    parameters: {
      type: 'object',
      properties: {
        projectCode: { type: 'string', description: 'Code du projet.' },
        tenderNumber: { type: 'string', description: 'Numéro du DAO (ex: 001/AONO/CIPM/2026).' },
        mode: {
          type: 'string',
          enum: ['AONO', 'AOIO', 'AONR', 'AOIR', 'ASMI', 'DC_COTATION', 'GRE_A_GRE', 'REGIE'],
          description: 'Mode de passation du DAO.',
        },
        publicationDateIso: {
          type: 'string',
          description: 'Date de publication de l’AAO au format ISO (YYYY-MM-DD).',
        },
        publicityDays: {
          type: 'integer',
          description: 'Nombre de jours de publicité souhaité (optionnel).',
        },
        isUrgent: { type: 'boolean', description: 'Vrai en cas d’urgence justifiée.' },
        addendumIssuedAtIso: {
          type: 'string',
          description: 'Optionnel : date d’émission d’un additif (YYYY-MM-DD) pour vérifier la prorogation.',
        },
        modifiesSubstantially: {
          type: 'boolean',
          description: 'Optionnel : vrai si l’additif modifie substantiellement le DAO.',
        },
      },
      required: ['projectCode', 'tenderNumber', 'mode', 'publicationDateIso'],
    },
  },
  {
    name: 'calculate_delay_penalties_with_weather',
    description:
      'Calcule les pénalités de retard progressives CMP (1/2000e J1-J30 puis 1/1000e au-delà, plafond 10%) avec déduction des jours d’intempéries dûment justifiés.',
    parameters: {
      type: 'object',
      properties: {
        contractNumber: { type: 'string', description: 'Numéro du marché ou de la lettre-commande.' },
        contractAmountTtc: { type: 'number', description: 'Montant initial du contrat TTC en FCFA.' },
        delayDays: { type: 'integer', description: 'Nombre total de jours calendaires de retard constatés.' },
        weatherExcusedDays: {
          type: 'integer',
          description: 'Nombre de jours d’intempéries ou force majeure admis par Ordre de Service.',
        },
        previousPenaltiesFcfa: {
          type: 'number',
          description: 'Cumul des pénalités déjà retenues sur les décomptes antérieurs.',
        },
      },
      required: ['contractAmountTtc', 'delayDays'],
    },
  },
  {
    name: 'liquidate_decompte',
    description:
      'Liquide un décompte provisoire ou définitif selon la fiscalité camerounaise (TVA 19,25%, AIR 2,2%/5,5% ou TSR 15%, avance démarrage, retenue de garantie 10%, pénalités, Net à Payer vs Reversement Trésor).',
    parameters: {
      type: 'object',
      properties: {
        contractType: {
          type: 'string',
          enum: ['BON_COMMANDE_ADMINISTRATIF', 'LETTRE_COMMANDE', 'MARCHE'],
          description: 'Type de contrat.',
        },
        contractInitialAmountTtc: { type: 'number', description: 'Montant initial du marché TTC.' },
        grossAmountHt: { type: 'number', description: 'Montant brut HT des prestations du décompte.' },
        fiscalRegime: {
          type: 'string',
          enum: ['REEL', 'SIMPLIFIE', 'LIBERATOIRE', 'ETRANGER_NON_RESIDENT'],
          description: 'Régime fiscal du titulaire.',
        },
        hasValidNonRedevance: {
          type: 'boolean',
          description: 'Vrai si attestation de non-redevance DGI en cours de validité.',
        },
        startAdvanceProrataRate: {
          type: 'number',
          description: 'Taux de remboursement au prorata de l’avance de démarrage (ex: 0.2).',
        },
        hasReplacementGuaranteeBond: {
          type: 'boolean',
          description: 'Vrai si une caution bancaire de remplacement couvre la retenue de garantie.',
        },
        delayDays: { type: 'integer', description: 'Jours de retard bruts éventuels.' },
        weatherExcusedDays: { type: 'integer', description: 'Jours d’intempéries déduits.' },
      },
      required: [
        'contractType',
        'contractInitialAmountTtc',
        'grossAmountHt',
        'fiscalRegime',
        'hasValidNonRedevance',
      ],
    },
  },
  {
    name: 'liquidate_session_indemnities',
    description:
      'Liquide les indemnités d’une séance (CIPM/CRPM/CDPM/SCA/Réception/ARMP) en croisant les barèmes et la feuille de présence émargée, avec exclusion des absents et vérification budgétaire.',
    parameters: {
      type: 'object',
      properties: {
        triggerEvent: {
          type: 'string',
          enum: [
            'VALIDATION_DAO',
            'OUVERTURE_PLIS',
            'ADOPTION_RAPPORT_SCA',
            'EXAMEN_AVENANT',
            'SUIVI_EXECUTION_DECOMPTE',
            'INSTRUCTION_CONTENTIEUX',
            'RECEPTION_PROVISOIRE',
            'RECEPTION_DEFINITIVE',
            'MISSION_TERRAIN',
          ],
          description: 'Acte générateur de la séance.',
        },
        commissionType: {
          type: 'string',
          enum: ['CIPM', 'CRPM', 'CDPM', 'CCCM_TR', 'CCCM_AG', 'CCCM_SPI', 'CCCM_FC'],
          description: 'Type de commission.',
        },
        procurementMode: {
          type: 'string',
          enum: ['AONO', 'AOIO', 'AONR', 'AOIR', 'ASMI', 'DC_COTATION', 'GRE_A_GRE', 'REGIE'],
          description: 'Mode de passation.',
        },
        contractAmountTtc: { type: 'number', description: 'Montant TTC du dossier examiné.' },
        lotsCount: { type: 'integer', description: 'Nombre de lots.' },
        bidsCount: { type: 'integer', description: 'Nombre de plis examinés.' },
        attendances: {
          type: 'array',
          description:
            'Liste des participants avec { attendanceId, userId, fullName, roleCode, isPresent, missionDays?, distanceKm? }.',
          items: { type: 'object' },
        },
        scales: {
          type: 'array',
          description: 'Barèmes applicables (IndemnityScale[]).',
          items: { type: 'object' },
        },
        budgetLine: {
          type: 'object',
          description:
            'Ligne budgétaire { budgetLineId, chapitre, article, initialAllocationFcfa, committedFcfa }.',
        },
      },
      required: [
        'triggerEvent',
        'procurementMode',
        'contractAmountTtc',
        'lotsCount',
        'bidsCount',
        'attendances',
        'scales',
        'budgetLine',
      ],
    },
  },
  {
    name: 'generate_transmission_bordereau',
    description:
      'Génère un Bordereau de Transmission ou une correspondance administrative camerounaise officielle (Timbre, Chrono, Références SQL, Objet, Formules hiérarchiques, Ampliations).',
    parameters: {
      type: 'object',
      properties: {
        caseType: {
          type: 'string',
          enum: [
            'BORDEREAU_TRANSMISSION',
            'NOTE_INFORMATION',
            'ORDRE_SERVICE',
            'MISE_EN_DEMEURE',
            'NOTIFICATION_ATTRIBUTION',
            'NOTIFICATION_REJET',
            'ETAT_INDEMNITES',
          ],
          description: "Type d'acte administratif à générer.",
        },
        chronoNumber: { type: 'string', description: 'Numéro de chrono attribué (ex: 014/BT/SIGAMP/2026).' },
        recipientLabel: { type: 'string', description: 'Intitulé exact du destinataire.' },
        recipientRank: { type: 'string', description: 'Rang administratif du destinataire.' },
        hierarchyDirection: {
          type: 'string',
          enum: ['ASCENDANT', 'EGALITAIRE', 'DESCENDANT', 'EXTERNE_TIERS'],
          description: 'Sens hiérarchique pour adapter les formules protocolaires.',
        },
        projectCode: { type: 'string', description: 'Code du projet.' },
        projectTitle: { type: 'string', description: 'Intitulé du projet.' },
        amountTtcFcfa: { type: 'number', description: 'Montant TTC en FCFA.' },
        procurementMode: { type: 'string', description: 'Mode de passation.' },
        commissionType: { type: 'string', description: 'Commission compétente.' },
        attachmentsList: {
          type: 'array',
          description: 'Liste des pièces transmises { designation, copiesCount, observations? }.',
          items: { type: 'object' },
        },
      },
      required: ['chronoNumber', 'recipientLabel', 'recipientRank'],
    },
  },
  {
    name: 'evaluate_amendment_cap',
    description:
      'Contrôle un projet d’avenant par rapport au plafond légal cumulatif de 30% et détermine la voie de validation (STANDARD_CPM_CF ou DEROGATION_EXCEPTIONNELLE_ACMP_MINMAP).',
    parameters: {
      type: 'object',
      properties: {
        initialContractAmountHt: { type: 'number', description: 'Montant initial HT du contrat.' },
        previousApprovedAmendmentsDeltaHt: {
          type: 'number',
          description: 'Cumul HT des avenants déjà approuvés.',
        },
        proposedAmendmentDeltaHt: {
          type: 'number',
          description: 'Variation HT du nouvel avenant proposé.',
        },
        hasCpmOrCccmOpinion: { type: 'boolean', description: 'Avis CPM/CCCM disponible.' },
        cpmOrCccmOpinionRef: { type: 'string', description: 'Référence de l’avis CPM/CCCM.' },
        hasBudgetaryCommitment: { type: 'boolean', description: 'Visa engagement budgétaire CF acquis.' },
        minmapDerogationRef: {
          type: 'string',
          description: 'Référence de dérogation ACMP/MINMAP si > 30%.',
        },
      },
      required: [
        'initialContractAmountHt',
        'previousApprovedAmendmentsDeltaHt',
        'proposedAmendmentDeltaHt',
        'hasCpmOrCccmOpinion',
        'hasBudgetaryCommitment',
      ],
    },
  },
  {
    name: 'check_mise_en_demeure_status',
    description:
      'Évalue le chronomètre légal de mise en demeure (15 à 21 jours calendaires) et vérifie l’éligibilité à la résiliation aux torts exclusifs.',
    parameters: {
      type: 'object',
      properties: {
        notifiedAtIso: { type: 'string', description: 'Date de notification de la mise en demeure (ISO).' },
        gracePeriodDays: { type: 'integer', description: 'Délai accordé entre 15 et 21 jours.' },
        evaluationDateIso: { type: 'string', description: 'Date d’évaluation du constat (ISO).' },
        remediedBySupplier: {
          type: 'boolean',
          description: 'Vrai si le titulaire a régularisé ses manquements dans les délais.',
        },
      },
      required: ['notifiedAtIso', 'gracePeriodDays', 'remediedBySupplier'],
    },
  },
  {
    name: 'search_cameroon_legal_corpus',
    description:
      'Recherche dans le corpus juridique complet de la commande publique camerounaise (Décret 2018/366 CMP, Décret 2013/271, CGCTD 2019/024, CGI/MINFI, Circulaire 001/CAB/PM Maturation, OHADA Sûretés, Circulaire ARMP).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Mots-clés ou question juridique (ex: maturation, oab, reception definitive, 30%, caution ohada).',
        },
        domainTag: {
          type: 'string',
          description: 'Tag domaine optionnel (ex: MATURATION, FISCALITE_DECOMPTES, RECEPTIONS_GARANTIES).',
        },
      },
      required: ['query'],
    },
  },
];

function asRequiredString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Paramètre chaîne obligatoire manquant ou vide : "${key}".`);
  }
  return v.trim();
}

function asRequiredNumber(args: Record<string, unknown>, key: string): number {
  const v = Number(args[key]);
  if (!Number.isFinite(v)) {
    throw new Error(`Paramètre numérique invalide ou manquant : "${key}".`);
  }
  return v;
}

function asOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  if (args[key] === undefined || args[key] === null) return undefined;
  const v = Number(args[key]);
  return Number.isFinite(v) ? v : undefined;
}

function formatFrenchDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function executeAiToolCall(
  toolCall: AiToolCallRequest,
  ctx: AiToolExecutionContext,
  gatewayRuntime?: GatewayRuntimeOptions
): Promise<AiToolExecutionResult> {
  const args = toolCall.arguments ?? {};

  try {
    switch (toolCall.name) {
      case 'create_procurement_project': {
        const projectCode = asRequiredString(args, 'projectCode');
        const title = asRequiredString(args, 'title');
        const nature = asRequiredString(args, 'nature') as ProcurementNature;
        const estimatedAmountTtc = asRequiredNumber(args, 'estimatedAmountTtc');

        const routing = routeProcurementProcedure({
          entityType: ctx.entityType,
          nature,
          estimatedAmountTtc,
          isInternational: Boolean(args.isInternational),
          isRestricted: Boolean(args.isRestricted),
          isGreAGreRequested: Boolean(args.isGreAGreRequested),
          greAGreJustification: args.greAGreJustification as
            | 'URGENCE_IMPERIEUSE'
            | 'MONOPOLE_BREVET'
            | 'SECRET_DEFENSE'
            | 'CARENCE_REPRISE'
            | undefined,
          isUrgent: Boolean(args.isUrgent),
        });

        const payload = {
          entityId: ctx.entityId,
          projectCode,
          title,
          nature,
          estimatedAmountTtc,
          fiscalYear: ctx.fiscalYear,
          routing,
        };

        const persistedId = ctx.persistAction
          ? await ctx.persistAction('create_procurement_project', payload)
          : undefined;

        return {
          toolName: toolCall.name,
          success: true,
          data: { ...payload, persistedId: persistedId ?? null },
          auditSummary: `Projet ${projectCode} routé en ${routing.contractType} (${routing.recommendedMode}) via ${routing.primaryCommission ?? 'procédure directe'}.`,
        };
      }

      case 'launch_tender_dao': {
        const projectCode = asRequiredString(args, 'projectCode');
        const tenderNumber = asRequiredString(args, 'tenderNumber');
        const mode = asRequiredString(args, 'mode') as ProcurementMode;
        const publicationDateIso = asRequiredString(args, 'publicationDateIso');
        const pubDate = new Date(publicationDateIso);
        if (Number.isNaN(pubDate.getTime())) {
          throw new Error(`Date de publication invalide : ${publicationDateIso}`);
        }

        const timeline = calculateLegalTimeline({
          publicationDate: pubDate,
          mode,
          publicityDays: asOptionalNumber(args, 'publicityDays'),
          isUrgent: Boolean(args.isUrgent),
        });

        let addendumCheck = null;
        if (typeof args.addendumIssuedAtIso === 'string' && args.addendumIssuedAtIso.trim()) {
          const addendumDate = new Date(args.addendumIssuedAtIso);
          if (Number.isNaN(addendumDate.getTime())) {
            throw new Error(`Date d'additif invalide : ${args.addendumIssuedAtIso}`);
          }
          addendumCheck = evaluateAddendumExtension({
            currentSubmissionDeadline: timeline.minSubmissionDeadline,
            addendumIssuedAt: addendumDate,
            modifiesSubstantially: Boolean(args.modifiesSubstantially),
          });
        }

        const payload = {
          projectCode,
          tenderNumber,
          mode,
          timeline: {
            publicationDateIso: timeline.publicationDate.toISOString(),
            minSubmissionDeadlineIso: timeline.minSubmissionDeadline.toISOString(),
            openingDateIso: timeline.openingDate.toISOString(),
            offerValidityEndDateIso: timeline.offerValidityEndDate.toISOString(),
            estimatedAwardPublicationDateIso: timeline.estimatedAwardPublicationDate.toISOString(),
            standstillEndDateIso: timeline.standstillEndDate.toISOString(),
          },
          addendumCheck,
        };

        if (ctx.persistAction) {
          await ctx.persistAction('launch_tender_dao', payload);
        }

        return {
          toolName: toolCall.name,
          success: true,
          data: payload,
          auditSummary: `DAO ${tenderNumber} (${mode}) planifié : ouverture le ${timeline.openingDate.toISOString().slice(0, 10)}, validité 90j jusqu'au ${timeline.offerValidityEndDate.toISOString().slice(0, 10)}.`,
        };
      }

      case 'calculate_delay_penalties_with_weather': {
        const contractAmountTtc = asRequiredNumber(args, 'contractAmountTtc');
        const delayDays = asRequiredNumber(args, 'delayDays');
        const weatherExcusedDays = asOptionalNumber(args, 'weatherExcusedDays') ?? 0;
        const previousPenaltiesFcfa = asOptionalNumber(args, 'previousPenaltiesFcfa') ?? 0;

        const result = calculateDelayPenalties({
          contractAmountTtc,
          delayDays,
          weatherExcusedDays,
          previousPenaltiesFcfa,
        });

        return {
          toolName: toolCall.name,
          success: true,
          data: {
            contractNumber: typeof args.contractNumber === 'string' ? args.contractNumber : null,
            ...result,
          },
          auditSummary: `Retard brut ${result.grossDelayDays}j - intempéries ${result.weatherExcusedDays}j = ${result.netDelayDays}j nets => pénalité plafonnée : ${result.cappedPenaltyFcfa.toLocaleString('fr-FR')} FCFA.`,
        };
      }

      case 'liquidate_decompte': {
        const result = calculateDecompte({
          contractType: asRequiredString(args, 'contractType') as ContractType,
          contractInitialAmountTtc: asRequiredNumber(args, 'contractInitialAmountTtc'),
          grossAmountHt: asRequiredNumber(args, 'grossAmountHt'),
          fiscalRegime: asRequiredString(args, 'fiscalRegime') as FiscalRegime,
          hasValidNonRedevance: Boolean(args.hasValidNonRedevance),
          startAdvanceProrataRate: asOptionalNumber(args, 'startAdvanceProrataRate'),
          hasReplacementGuaranteeBond: Boolean(args.hasReplacementGuaranteeBond),
          delayDays: asOptionalNumber(args, 'delayDays'),
          weatherExcusedDays: asOptionalNumber(args, 'weatherExcusedDays'),
        });

        return {
          toolName: toolCall.name,
          success: true,
          data: { ...result },
          auditSummary: `Décompte liquidé : Brut TTC ${result.grossAmountTtc.toLocaleString('fr-FR')} FCFA | Net à payer titulaire ${result.netPayableSupplierFcfa.toLocaleString('fr-FR')} FCFA | Reversement Trésor ${result.treasuryReversementFcfa.toLocaleString('fr-FR')} FCFA.`,
        };
      }

      case 'liquidate_session_indemnities': {
        const triggerEvent = asRequiredString(args, 'triggerEvent') as IndemnityTriggerEvent;
        const procurementMode = asRequiredString(args, 'procurementMode') as ProcurementMode;
        const commissionType =
          typeof args.commissionType === 'string'
            ? (args.commissionType as CommissionType)
            : null;

        const liquidation = calculateIndemnityLiquidation({
          entityId: ctx.entityId,
          fiscalYear: ctx.fiscalYear,
          triggerEvent,
          commissionType,
          procurementMode,
          contractAmountTtc: asRequiredNumber(args, 'contractAmountTtc'),
          lotsCount: asRequiredNumber(args, 'lotsCount'),
          bidsCount: asRequiredNumber(args, 'bidsCount'),
          scales: (Array.isArray(args.scales) ? args.scales : []) as IndemnityScale[],
          attendances: (Array.isArray(args.attendances)
            ? args.attendances
            : []) as SessionAttendanceRecord[],
          budgetLine: args.budgetLine as BudgetLineSnapshot,
        });

        if (ctx.persistAction && liquidation.canSubmitForVisaCf) {
          await ctx.persistAction('liquidate_session_indemnities', {
            triggerEvent,
            liquidation,
          });
        }

        return {
          toolName: toolCall.name,
          success: true,
          data: { ...liquidation },
          auditSummary: `Indemnités ${triggerEvent} : ${liquidation.items.length} bénéficiaire(s) liquidé(s) (${liquidation.excludedActors.length} exclu(s)), total brut ${liquidation.totalGrossFcfa.toLocaleString('fr-FR')} FCFA, Visa CF éligible : ${liquidation.canSubmitForVisaCf ? 'OUI' : 'NON'}.`,
        };
      }

      case 'generate_transmission_bordereau': {
        const caseType = (
          typeof args.caseType === 'string' ? args.caseType : 'BORDEREAU_TRANSMISSION'
        ) as CorrespondenceCaseType;
        const chronoNumber = asRequiredString(args, 'chronoNumber');
        const recipientLabel = asRequiredString(args, 'recipientLabel');
        const recipientRank = asRequiredString(args, 'recipientRank');
        const hierarchyDirection = (
          typeof args.hierarchyDirection === 'string' ? args.hierarchyDirection : 'EGALITAIRE'
        ) as HierarchyDirection;

        const generated = await generateAdministrativeCorrespondence(
          {
            entityId: ctx.entityId,
            caseType,
            header: {
              entityName: ctx.entityName,
              entityType: ctx.entityType,
              serviceLine: 'Service Interne de Gestion Administrative des Marchés Publics (SIGAMP)',
              city: ctx.city,
              chronoNumber,
              dateFormatted: formatFrenchDate(new Date()),
              senderRole: ctx.actorRole as RbacRole,
              senderTitle: ctx.actorTitle,
              senderName: ctx.actorName,
              recipientLabel,
              recipientRank,
              hierarchyDirection,
            },
            sqlContext: {
              projectCode: typeof args.projectCode === 'string' ? args.projectCode : undefined,
              projectTitle: typeof args.projectTitle === 'string' ? args.projectTitle : undefined,
              fiscalYear: ctx.fiscalYear,
              amountTtcFcfa: asOptionalNumber(args, 'amountTtcFcfa'),
              procurementMode:
                typeof args.procurementMode === 'string'
                  ? (args.procurementMode as ProcurementMode)
                  : undefined,
              commissionType:
                typeof args.commissionType === 'string'
                  ? (args.commissionType as CommissionType)
                  : undefined,
              attachmentsList: Array.isArray(args.attachmentsList)
                ? (args.attachmentsList as Array<{
                    designation: string;
                    copiesCount: number;
                    observations?: string;
                  }>)
                : undefined,
            },
            useAiRefinement: false,
          },
          gatewayRuntime
        );

        if (ctx.persistAction) {
          await ctx.persistAction('generate_transmission_bordereau', { ...generated });
        }

        return {
          toolName: toolCall.name,
          success: true,
          data: { ...generated },
          auditSummary: `Acte ${caseType} n° ${chronoNumber} généré pour ${recipientLabel}.`,
        };
      }

      case 'evaluate_amendment_cap': {
        const result = evaluateAmendment({
          initialContractAmountHt: asRequiredNumber(args, 'initialContractAmountHt'),
          previousApprovedAmendmentsDeltaHt: asRequiredNumber(
            args,
            'previousApprovedAmendmentsDeltaHt'
          ),
          proposedAmendmentDeltaHt: asRequiredNumber(args, 'proposedAmendmentDeltaHt'),
          hasCpmOrCccmOpinion: Boolean(args.hasCpmOrCccmOpinion),
          cpmOrCccmOpinionRef:
            typeof args.cpmOrCccmOpinionRef === 'string' ? args.cpmOrCccmOpinionRef : undefined,
          hasBudgetaryCommitment: Boolean(args.hasBudgetaryCommitment),
          minmapDerogationRef:
            typeof args.minmapDerogationRef === 'string' ? args.minmapDerogationRef : undefined,
        });

        return {
          toolName: toolCall.name,
          success: true,
          data: { ...result },
          auditSummary: `Avenant cumulé à ${result.cumulativePercentage}% -> voie ${result.requiredWorkflowRoute} (signable : ${result.canSignOrExecute ? 'OUI' : 'NON'}).`,
        };
      }

      case 'check_mise_en_demeure_status': {
        const notifiedAtIso = asRequiredString(args, 'notifiedAtIso');
        const notifiedAt = new Date(notifiedAtIso);
        const evaluationDate =
          typeof args.evaluationDateIso === 'string' && args.evaluationDateIso.trim()
            ? new Date(args.evaluationDateIso)
            : new Date();

        const status = evaluateMiseEnDemeure({
          notifiedAt,
          gracePeriodDays: asRequiredNumber(args, 'gracePeriodDays'),
          evaluationDate,
          remediedBySupplier: Boolean(args.remediedBySupplier),
        });

        return {
          toolName: toolCall.name,
          success: true,
          data: {
            notifiedAtIso: status.notifiedAt.toISOString(),
            deadlineDateIso: status.deadlineDate.toISOString(),
            gracePeriodDays: status.gracePeriodDays,
            daysRemaining: status.daysRemaining,
            isExpired: status.isExpired,
            eligibleForFaultTermination: status.eligibleForFaultTermination,
          },
          auditSummary: `Mise en demeure (${status.gracePeriodDays}j) : échéance ${status.deadlineDate.toISOString().slice(0, 10)}, éligible résiliation : ${status.eligibleForFaultTermination ? 'OUI' : 'NON'}.`,
        };
      }

      case 'search_cameroon_legal_corpus': {
        const query = asRequiredString(args, 'query');
        const domainTag =
          typeof args.domainTag === 'string' && args.domainTag.trim()
            ? args.domainTag.trim()
            : undefined;
        const matches = searchLocalLegalCorpus(query, { domainTag, limit: 4 });

        return {
          toolName: toolCall.name,
          success: true,
          data: { query, matches },
          auditSummary: `Corpus juridique camerounais : ${matches.length} texte(s) pertinent(s) trouvé(s) (${matches
            .map((m) => `${m.sourceCode} ${m.articleRef}`)
            .join(', ')}).`,
        };
      }

      default:
        return {
          toolName: toolCall.name,
          success: false,
          error: `Outil inconnu ou non autorisé : "${toolCall.name}".`,
          auditSummary: `Appel outil rejeté (${toolCall.name}).`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      toolName: toolCall.name,
      success: false,
      error: msg,
      auditSummary: `Erreur d'exécution sur ${toolCall.name} : ${msg}`,
    };
  }
}

export async function runAgenticWorkflow(params: {
  userPrompt: string;
  history?: AiChatMessage[];
  context: AiToolExecutionContext;
  offlineMode?: boolean;
  maxIterations?: number;
  gatewayRuntime?: GatewayRuntimeOptions;
}): Promise<AgenticWorkflowResult> {
  const maxIterations = params.maxIterations ?? 4;
  const ragMatches = searchLocalLegalCorpus(params.userPrompt, { limit: 3 });
  const systemPromptWithRag = `${NLP_COPILOT_SYSTEM_PROMPT}${formatLegalRagContext(ragMatches)}`;
  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPromptWithRag },
    ...(params.history ?? []),
    { role: 'user', content: params.userPrompt },
  ];

  const toolExecutions: AiToolExecutionResult[] = [];
  let iterations = 0;
  let lastProvider: AgenticWorkflowResult['providerUsed'] = 'groq';
  let lastModel = '';
  let isOfflineFallback = false;

  while (iterations < maxIterations) {
    iterations += 1;
    const response = await invokeAiGateway(
      {
        taskKind: params.offlineMode ? 'OFFLINE_LOCAL' : 'FAST_NLP_COMMAND',
        offlineMode: params.offlineMode,
        messages,
        tools: AI_TOOL_DEFINITIONS,
        temperature: 0.1,
      },
      params.gatewayRuntime
    );

    lastProvider = response.providerUsed;
    lastModel = response.modelUsed;
    isOfflineFallback = response.isOfflineFallback;

    if (response.toolCalls.length === 0) {
      return {
        answer: response.content,
        providerUsed: lastProvider,
        modelUsed: lastModel,
        toolExecutions,
        iterations,
        isOfflineFallback,
      };
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      toolCalls: response.toolCalls,
    });

    for (const tc of response.toolCalls) {
      const execResult = await executeAiToolCall(tc, params.context, params.gatewayRuntime);
      toolExecutions.push(execResult);
      messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: JSON.stringify(execResult),
      });
    }
  }

  return {
    answer:
      toolExecutions.map((t) => t.auditSummary).join('\n') ||
      'Traitement interrompu après le nombre maximal d’itérations.',
    providerUsed: lastProvider,
    modelUsed: lastModel,
    toolExecutions,
    iterations,
    isOfflineFallback,
  };
}
