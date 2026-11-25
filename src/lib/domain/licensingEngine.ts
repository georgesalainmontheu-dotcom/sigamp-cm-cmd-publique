import { computeSha256Hex } from '../offline/offlineStore';

export type LicensePlanCode =
  | 'ESSAI_DEMO'
  | 'MENSUELLE'
  | 'ANNUELLE'
  | 'PLURIANNUELLE'
  | 'SOUVERAINE';

export type EntityLicenseStatus =
  | 'ACTIVE'
  | 'SUSPENDUE'
  | 'EXPIREE'
  | 'EN_ATTENTE_VALIDATION';

export interface LicensePlanDefinition {
  planCode: LicensePlanCode;
  label: string;
  description: string;
  durationDays: number;
  priceFcfa: number;
  maxActiveLogins: number;
  includesAiCopilot: boolean;
  includesStudioCms: boolean;
}

export const LICENSE_PLANS: LicensePlanDefinition[] = [
  {
    planCode: 'ESSAI_DEMO',
    label: 'Essai & Découverte (30 jours)',
    description: 'Licence d’évaluation complète pour phase pilote et maturation initiale.',
    durationDays: 30,
    priceFcfa: 0,
    maxActiveLogins: 10,
    includesAiCopilot: true,
    includesStudioCms: true,
  },
  {
    planCode: 'MENSUELLE',
    label: 'Licence Mensuelle Institutionnelle',
    description: 'Accès complet mensuel avec Copilote IA et Studio Visuel.',
    durationDays: 30,
    priceFcfa: 150_000,
    maxActiveLogins: 25,
    includesAiCopilot: true,
    includesStudioCms: true,
  },
  {
    planCode: 'ANNUELLE',
    label: 'Licence Annuelle Standard (CTD / EPA)',
    description: 'Couverture annuelle complète pour Commune, EPA ou Projet.',
    durationDays: 365,
    priceFcfa: 1_500_000,
    maxActiveLogins: 60,
    includesAiCopilot: true,
    includesStudioCms: true,
  },
  {
    planCode: 'PLURIANNUELLE',
    label: 'Licence Pluriannuelle (3 Ans)',
    description: 'Engagement triennal optimisé avec support prioritaire TIT-CS.',
    durationDays: 1095,
    priceFcfa: 3_900_000,
    maxActiveLogins: 150,
    includesAiCopilot: true,
    includesStudioCms: true,
  },
  {
    planCode: 'SOUVERAINE',
    label: 'Licence Souveraine Illimitée (Ministère / Région)',
    description: 'Déploiement souverain multi-services, API & comptes illimités.',
    durationDays: 365,
    priceFcfa: 6_500_000,
    maxActiveLogins: 9999,
    includesAiCopilot: true,
    includesStudioCms: true,
  },
];

export interface EntityLicenseRecord {
  id: string;
  entityId: string;
  entityCode: string;
  entityName: string;
  planCode: LicensePlanCode;
  status: EntityLicenseStatus;
  licenseKey: string;
  offlineProofToken: string;
  startsAtIso: string;
  expiresAtIso: string;
  maxActiveLogins: number;
  amountFcfa: number;
  paymentRef?: string;
  receiptSha256?: string;
}

export interface LicenseEvaluationResult {
  effectiveStatus: EntityLicenseStatus;
  daysRemaining: number;
  isExpiringSoon: boolean;
  canCreateNewActs: boolean;
  canReadArchives: boolean;
  canLogin: boolean;
  alertSeverity: 'NONE' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
  statusMessage: string;
}

/**
 * Évalue les droits opérationnels d'une entité selon l'état de sa licence d'exploitation.
 * - ACTIVE (non expirée) : accès complet + alerte préventive <= 30 jours.
 * - EXPIREE : consultation des archives préservée, création de nouveaux marchés/actes bloquée.
 * - SUSPENDUE / EN_ATTENTE_VALIDATION : accès bloqué jusqu'à régularisation TIT-CS.
 */
export function evaluateEntityLicenseStatus(
  license: Pick<EntityLicenseRecord, 'status' | 'expiresAtIso' | 'planCode'>,
  referenceDate: Date = new Date()
): LicenseEvaluationResult {
  const expMs = new Date(license.expiresAtIso).getTime();
  const daysRemaining = Number.isNaN(expMs)
    ? -1
    : Math.ceil((expMs - referenceDate.getTime()) / (24 * 60 * 60 * 1000));

  let effectiveStatus: EntityLicenseStatus = license.status;
  if (license.status === 'ACTIVE' && daysRemaining < 0) {
    effectiveStatus = 'EXPIREE';
  }

  if (effectiveStatus === 'SUSPENDUE' || effectiveStatus === 'EN_ATTENTE_VALIDATION') {
    return {
      effectiveStatus,
      daysRemaining: Math.max(0, daysRemaining),
      isExpiringSoon: false,
      canCreateNewActs: false,
      canReadArchives: false,
      canLogin: false,
      alertSeverity: 'BLOCKED',
      statusMessage:
        effectiveStatus === 'SUSPENDUE'
          ? 'Licence suspendue par l’éditeur TIT-CS. Contactez le support pour réactivation.'
          : 'Licence en attente de validation du règlement.',
    };
  }

  if (effectiveStatus === 'EXPIREE') {
    return {
      effectiveStatus: 'EXPIREE',
      daysRemaining: 0,
      isExpiringSoon: false,
      canCreateNewActs: false,
      canReadArchives: true,
      canLogin: true,
      alertSeverity: 'CRITICAL',
      statusMessage:
        'Licence expirée : création de nouveaux marchés/actes bloquée. Consultation des archives préservée.',
    };
  }

  const isExpiringSoon = daysRemaining <= 30;
  return {
    effectiveStatus: 'ACTIVE',
    daysRemaining,
    isExpiringSoon,
    canCreateNewActs: true,
    canReadArchives: true,
    canLogin: true,
    alertSeverity: daysRemaining <= 7 ? 'CRITICAL' : isExpiringSoon ? 'WARNING' : 'NONE',
    statusMessage: isExpiringSoon
      ? `Licence ${license.planCode} active — renouvellement recommandé sous ${daysRemaining} jour(s).`
      : `Licence ${license.planCode} active (${daysRemaining} jours restants).`,
  };
}

export interface IssueLicenseInput {
  entityId: string;
  entityCode: string;
  entityName: string;
  planCode: LicensePlanCode;
  paymentChannel: 'VIREMENT_TRESOR' | 'BON_COMMANDE_PUBLIC' | 'MTN_MOMO' | 'ORANGE_MONEY';
  paymentRef: string;
  startsAtDate?: Date;
  autoActivate?: boolean;
}

export interface IssuedLicenseBundle {
  orderRef: string;
  license: EntityLicenseRecord;
  receiptText: string;
}

export async function issueEntityLicense(
  input: IssueLicenseInput
): Promise<IssuedLicenseBundle> {
  const plan =
    LICENSE_PLANS.find((p) => p.planCode === input.planCode) ?? LICENSE_PLANS[2]!;
  const start = input.startsAtDate ?? new Date();
  const expires = new Date(start.getTime() + plan.durationDays * 86_400_000);
  const cleanCode = input.entityCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'ENT';
  const suffix = (await computeSha256Hex(`${input.entityId}|${input.paymentRef}|${start.toISOString()}`))
    .slice(0, 6)
    .toUpperCase();

  const licenseKey = `TITCS-SIGAMP-${cleanCode}-${start.getUTCFullYear()}-${suffix}`;
  const orderRef = `CMD-LIC-${cleanCode}-${suffix}`;
  const offlineProofToken = `OFFLINE-PROOF-${await computeSha256Hex(
    `${licenseKey}|${expires.toISOString()}|TIT-CS-2026`
  )}`.slice(0, 44);

  const receiptPayload = `${orderRef}|${input.entityName}|${plan.planCode}|${plan.priceFcfa}|${licenseKey}|${expires.toISOString()}`;
  const receiptSha256 = await computeSha256Hex(receiptPayload);

  const license: EntityLicenseRecord = {
    id: `lic-${suffix.toLowerCase()}`,
    entityId: input.entityId,
    entityCode: input.entityCode,
    entityName: input.entityName,
    planCode: plan.planCode,
    status: input.autoActivate ? 'ACTIVE' : 'EN_ATTENTE_VALIDATION',
    licenseKey,
    offlineProofToken,
    startsAtIso: start.toISOString(),
    expiresAtIso: expires.toISOString(),
    maxActiveLogins: plan.maxActiveLogins,
    amountFcfa: plan.priceFcfa,
    paymentRef: input.paymentRef,
    receiptSha256,
  };

  const receiptText = `TIT-CONSULTING SOLUTIONS (TIT-CS) — REÇU & TITRE DE LICENCE D'EXPLOITATION SIGAMP-CM
Éditeur : TIT-CS (Bafang, Cameroun) — © 2026 Joël Tchassom & TIT-Consulting Solutions
Référence Commande : ${orderRef} | Statut : ${license.status}
Entité Bénéficiaire : ${input.entityName} (${input.entityCode})
Formule Souscrite : ${plan.label} (${plan.durationDays} jours · max ${plan.maxActiveLogins} logins)
Montant : ${plan.priceFcfa.toLocaleString('fr-FR')} FCFA | Paiement (${input.paymentChannel}) : ${input.paymentRef}
Clé de Licence : ${licenseKey}
Validité : du ${start.toISOString().slice(0, 10)} au ${expires.toISOString().slice(0, 10)}
Jeton Offline PWA : ${offlineProofToken}
Empreinte SHA-256 : ${receiptSha256}`;

  return {
    orderRef,
    license,
    receiptText,
  };
}

export type LicenseReminderTier = 'NONE' | 'J_30' | 'J_15' | 'J_7' | 'J_1' | 'EXPIREE';

export interface LicenseAlertRelanceInfo {
  tier: LicenseReminderTier;
  alertSeverity: 'NONE' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
  daysRemaining: number;
  autoAction:
    | 'AUCUNE'
    | 'BANNIERE_PREVENTIVE'
    | 'RELANCE_EMAIL_URGENTE'
    | 'MODE_LECTURE_SEULE'
    | 'BLOCAGE_TOTAL';
  relanceSubject: string;
  relanceBody: string;
  mailtoHref: string;
}

export function evaluateLicenseAlertAndRelance(
  license: Pick<EntityLicenseRecord, 'status' | 'expiresAtIso' | 'planCode' | 'licenseKey'> & {
    entityName?: string;
    entityCode?: string;
    contactEmail?: string;
  },
  referenceDate: Date = new Date()
): LicenseAlertRelanceInfo {
  const evalRes = evaluateEntityLicenseStatus(license, referenceDate);
  const days = evalRes.daysRemaining;
  let tier: LicenseReminderTier = 'NONE';
  let autoAction: LicenseAlertRelanceInfo['autoAction'] = 'AUCUNE';

  if (evalRes.effectiveStatus === 'SUSPENDUE' || evalRes.effectiveStatus === 'EN_ATTENTE_VALIDATION') {
    tier = 'EXPIREE';
    autoAction = 'BLOCAGE_TOTAL';
  } else if (evalRes.effectiveStatus === 'EXPIREE' || days < 0) {
    tier = 'EXPIREE';
    autoAction = 'MODE_LECTURE_SEULE';
  } else if (days <= 1) {
    tier = 'J_1';
    autoAction = 'RELANCE_EMAIL_URGENTE';
  } else if (days <= 7) {
    tier = 'J_7';
    autoAction = 'RELANCE_EMAIL_URGENTE';
  } else if (days <= 15) {
    tier = 'J_15';
    autoAction = 'BANNIERE_PREVENTIVE';
  } else if (days <= 30) {
    tier = 'J_30';
    autoAction = 'BANNIERE_PREVENTIVE';
  }

  const label = license.entityName
    ? `${license.entityName} (${license.entityCode ?? ''})`
    : 'Entité Publique';
  const relanceSubject = `[SIGAMP-CM / TIT-CS] Alerte Licence ${tier} — ${label}`;
  const relanceBody = [
    `Madame / Monsieur le Responsable (${label}),`,
    '',
    `Votre licence SIGAMP-CM (${license.planCode} — Clé ${license.licenseKey}) arrive à échéance le ${license.expiresAtIso.slice(0, 10)} (statut : ${evalRes.effectiveStatus}, ${days} jour(s) restant(s)).`,
    tier === 'EXPIREE'
      ? 'Conformément à la politique TIT-CS, vos archives GED restent consultables, mais la création de nouveaux marchés et actes est verrouillée jusqu’au renouvellement.'
      : 'Pour éviter toute interruption de passation des marchés publics, veuillez procéder au renouvellement depuis Studio & CMS > Vente & Gestion des Licences (Virement Trésor, Bon de Commande Public, MTN MoMo ou Orange Money).',
    '',
    'Cordialement,',
    'Direction Plateforme TIT-Consulting Solutions (TIT-CS)',
  ].join('\n');

  const to = license.contactEmail ?? '';
  const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    relanceSubject
  )}&body=${encodeURIComponent(relanceBody)}`;

  return {
    tier,
    alertSeverity: evalRes.alertSeverity,
    daysRemaining: days,
    autoAction,
    relanceSubject,
    relanceBody,
    mailtoHref,
  };
}

export async function verifyOfflineLicenseProofToken(
  token: string,
  license: Pick<EntityLicenseRecord, 'licenseKey' | 'expiresAtIso'>
): Promise<boolean> {
  const expected = `OFFLINE-PROOF-${await computeSha256Hex(
    `${license.licenseKey}|${license.expiresAtIso}|TIT-CS-2026`
  )}`.slice(0, 44);
  return token === expected;
}
