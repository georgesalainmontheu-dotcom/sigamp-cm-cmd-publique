import type {
  AdmissibilityCheckResult,
  DisputeAuditInput,
  DisputeAuditResult,
  DisputeBidSnapshot,
  DisputeRiskScore,
  FactualCrossCheckItem,
} from '../../types/ai';
import {
  addBusinessDaysCameroon,
  isBusinessDayCameroon,
} from '../domain/procurementRouter';
import { invokeAiGateway, type GatewayRuntimeOptions } from './aiGateway';
import {
  formatFcfaAmount,
  generateAdministrativeCorrespondence,
} from './correspondenceGenerator';
import {
  DISPUTE_LEGAL_AUDITOR_SYSTEM_PROMPT,
  formatLegalRagContext,
} from './legalPrompts';
import { searchLocalLegalCorpus } from '../legal/cameroonLegalCorpus';

/**
 * Moteur 4 (Jalon 3) : Assistant d'Audit & Réponse aux Contentieux
 * 1. Contrôle automatique des délais de forclusion (5 jours ouvrables camerounais post-publication)
 * 2. Verrouillage suspensif automatique de la signature du marché (CMP)
 * 3. Croisement factuel des griefs avec PV d'ouverture, rapport SCA, dates d'expiration des pièces et registre ARMP
 * 4. Diagnostic de risque juridique + Génération simultanée :
 *    - Projet de réponse motivée du Maître d'Ouvrage
 *    - Mémoire en défense complet pour le Comité de Règlement des Différends (ARMP)
 */

function toUtcDayEnd(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function toUtcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}

export function countCameroonBusinessDaysBetween(
  startDate: Date,
  endDate: Date,
  extraHolidaysIso: Set<string> = new Set()
): number {
  const start = toUtcDayStart(startDate);
  const end = toUtcDayStart(endDate);
  if (end.getTime() <= start.getTime()) return 0;

  let count = 0;
  const cursor = new Date(start.getTime());
  while (cursor.getTime() < end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDayCameroon(cursor, extraHolidaysIso)) {
      count += 1;
    }
  }
  return count;
}

export function checkDisputeAdmissibility(
  input: Pick<
    DisputeAuditInput,
    | 'stage'
    | 'filedAtIso'
    | 'referenceEventAtIso'
    | 'priorMoSeizureVerified'
    | 'appealBondRequired'
    | 'appealBondRef'
    | 'legalDeadlineBusinessDays'
    | 'extraHolidaysIso'
  >
): AdmissibilityCheckResult {
  const referenceDate = new Date(input.referenceEventAtIso);
  const filedDate = new Date(input.filedAtIso);
  if (Number.isNaN(referenceDate.getTime()) || Number.isNaN(filedDate.getTime())) {
    throw new Error('Dates de référence ou de dépôt du recours invalides.');
  }

  const isPassationStage =
    input.stage === 'PRE_OUVERTURE' ||
    input.stage === 'OUVERTURE_PLIS' ||
    input.stage === 'ATTRIBUTION';

  // CMP Décret 2018/366 : 5 jours ouvrables en phase de passation ; 15 jours ouvrables par défaut en exécution/résiliation
  const defaultStageDays = isPassationStage ? 5 : 15;
  const legalDays = input.legalDeadlineBusinessDays ?? defaultStageDays;
  const holidays = new Set(input.extraHolidaysIso ?? []);

  const deadlineDay = addBusinessDaysCameroon(referenceDate, legalDays, holidays);
  const deadlineEnd = toUtcDayEnd(deadlineDay);
  const businessDaysElapsed = countCameroonBusinessDaysBetween(
    referenceDate,
    filedDate,
    holidays
  );

  const isWithinDeadline = filedDate.getTime() <= deadlineEnd.getTime();
  const isForeclosed = !isWithinDeadline;
  const appealBondRequired = Boolean(input.appealBondRequired);
  const appealBondRefClean = input.appealBondRef?.trim() || undefined;
  const appealBondProvided = Boolean(appealBondRefClean);

  const missingAdmissibilityElements: string[] = [];
  if (!input.priorMoSeizureVerified) {
    missingAdmissibilityElements.push('Preuve de saisine préalable du Maître d’Ouvrage');
  }
  if (appealBondRequired && !appealBondProvided) {
    missingAdmissibilityElements.push('Référence du cautionnement de recours (consignation ARMP)');
  }

  const isAdmissible =
    isWithinDeadline &&
    input.priorMoSeizureVerified &&
    (!appealBondRequired || appealBondProvided);

  // Trigger SQL : effet suspensif automatique dès lors que le recours en passation n'est pas forclos
  const suspensionActive = isPassationStage && !isForeclosed;
  const contractSignatureLocked = suspensionActive;

  const admissibilityReasons: string[] = [
    `Phase procédurale contrôlée : ${input.stage} (${isPassationStage ? 'Passation — délai légal 5 jours ouvrables CMP' : 'Exécution / Résiliation'}).`,
  ];
  if (isForeclosed) {
    admissibilityReasons.push(
      `FORCLUSION CONSTATÉE : Recours déposé après expiration du délai légal de ${legalDays} jours ouvrables (${businessDaysElapsed} jour(s) ouvrable(s) écoulé(s) ; date limite : ${deadlineDay
        .toISOString()
        .slice(0, 10)}).`
    );
  } else {
    admissibilityReasons.push(
      `Délai légal respecté : ${businessDaysElapsed}/${legalDays} jour(s) ouvrable(s) écoulé(s) (échéance : ${deadlineDay
        .toISOString()
        .slice(0, 10)}).`
    );
  }

  if (!input.priorMoSeizureVerified) {
    admissibilityReasons.push(
      'IRRECEVABILITÉ FORMELLE POSSIBLE : Absence de preuve de saisine préalable du Maître d’Ouvrage avant saisine de l’ARMP.'
    );
  }

  if (appealBondRequired) {
    if (appealBondProvided) {
      admissibilityReasons.push(
        `Cautionnement de recours vérifié : réf. ${appealBondRefClean}.`
      );
    } else {
      admissibilityReasons.push(
        'IRRECEVABILITÉ FORMELLE POSSIBLE : Référence de cautionnement de recours exigée mais absente.'
      );
    }
  }

  if (suspensionActive) {
    admissibilityReasons.push(
      'EFFET SUSPENSIF ACTIVÉ DE PLEIN DROIT : Signature du contrat verrouillée jusqu’à décision définitive (CMP).'
    );
  }

  return {
    stage: input.stage,
    referenceEventAtIso: referenceDate.toISOString(),
    filedAtIso: filedDate.toISOString(),
    legalDeadlineDateIso: deadlineEnd.toISOString(),
    businessDaysElapsed,
    legalDeadlineBusinessDays: legalDays,
    isWithinDeadline,
    priorMoSeizureVerified: input.priorMoSeizureVerified,
    appealBondRequired,
    appealBondProvided,
    appealBondRef: appealBondRefClean,
    missingAdmissibilityElements,
    isAdmissible,
    isForeclosed,
    suspensionActive,
    contractSignatureLocked,
    admissibilityReasons,
  };
}

function findExpiredOrMissingDocsAtDate(
  bid: DisputeBidSnapshot,
  openingDateIso: string
): Array<{ docType: string; issue: string }> {
  const openingDate = toUtcDayStart(new Date(openingDateIso));
  const issues: Array<{ docType: string; issue: string }> = [];

  for (const doc of bid.adminDocuments) {
    if (!doc.isPresentAtOpening) {
      issues.push({
        docType: doc.docType,
        issue: `Pièce "${doc.docType}" (${doc.documentRef}) absente lors de la séance d'ouverture des plis.`,
      });
      continue;
    }
    if (doc.expiresAt) {
      const exp = toUtcDayStart(new Date(doc.expiresAt));
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < openingDate.getTime()) {
        issues.push({
          docType: doc.docType,
          issue: `Pièce "${doc.docType}" (${doc.documentRef}) expirée le ${doc.expiresAt.slice(
            0,
            10
          )}, antérieurement à l'ouverture des plis (${openingDateIso.slice(0, 10)}).`,
        });
      }
    }
    if (doc.isAuthenticVerified === false) {
      issues.push({
        docType: doc.docType,
        issue: `Pièce "${doc.docType}" (${doc.documentRef}) signalée non conforme/non authentique.`,
      });
    }
  }
  return issues;
}

export function crossCheckDisputeFacts(input: DisputeAuditInput): FactualCrossCheckItem[] {
  const results: FactualCrossCheckItem[] = [];
  const claimantBid = input.bids.find((b) => b.isClaimant || b.supplierId === input.claimantSupplierId);
  const winnerBid = input.bids.find((b) => b.isProvisionalWinner);

  // 1. Vérification PV d'ouverture (délai dépôt, quorum, observateur ARMP)
  if (claimantBid) {
    const submittedAt = new Date(claimantBid.submittedAtIso);
    const deadline = new Date(input.openingPv.submissionDeadlineIso);
    if (claimantBid.isLate || submittedAt.getTime() > deadline.getTime()) {
      results.push({
        grievance: 'Recevabilité temporelle de l’offre du requérant à l’ouverture des plis',
        verificationSource: 'PV_OUVERTURE',
        verdict: 'INFIRME_GRIEF',
        evidenceDetails: `PV ${input.openingPv.pvNumber} : Pli déposé le ${claimantBid.submittedAtIso} après l’heure limite (${input.openingPv.submissionDeadlineIso}). Rejet automatique réglementaire.`,
        legalImpact: 'AUCUN',
      });
    }

    if (claimantBid.isArmpExcluded) {
      results.push({
        grievance: 'Éligibilité du requérant au regard du fichier ARMP des entreprises exclues',
        verificationSource: 'REGISTRE_ARMP',
        verdict: 'INFIRME_GRIEF',
        evidenceDetails: `Entreprise requérante figurant sur la liste d’exclusion ARMP (jusqu’au ${claimantBid.armpExclusionUntilIso ?? 'nouvel ordre'}).`,
        legalImpact: 'AUCUN',
      });
    }

    if (
      claimantBid.requiredBidBondFcfa !== undefined &&
      (claimantBid.bidBondAmountFcfa ?? 0) < claimantBid.requiredBidBondFcfa
    ) {
      results.push({
        grievance: 'Conformité de la caution de soumission du requérant',
        verificationSource: 'PV_OUVERTURE',
        verdict: 'INFIRME_GRIEF',
        evidenceDetails: `Caution fournie (${formatFcfaAmount(
          claimantBid.bidBondAmountFcfa ?? 0
        )}) inférieure au minimum exigé par le DAO (${formatFcfaAmount(
          claimantBid.requiredBidBondFcfa
        )}).`,
        legalImpact: 'AUCUN',
      });
    }

    const claimantDocIssues = findExpiredOrMissingDocsAtDate(
      claimantBid,
      input.openingPv.openingDateIso
    );
    if (claimantDocIssues.length > 0) {
      results.push({
        grievance: 'Validité des pièces administratives du requérant à la date d’ouverture',
        verificationSource: 'EXPIRATION_PIECES',
        verdict: 'INFIRME_GRIEF',
        evidenceDetails: claimantDocIssues.map((d) => d.issue).join(' | '),
        legalImpact: 'AUCUN',
      });
    } else if (claimantBid.adminEliminated) {
      results.push({
        grievance: 'Contestation de l’élimination administrative du requérant par la SCA',
        verificationSource: 'RAPPORT_SCA',
        verdict: 'CONFIRME_GRIEF',
        evidenceDetails: `Le requérant a été éliminé administrativement (${claimantBid.eliminationReasons.join(
          ', '
        ) || 'motif non précisé'}), alors qu’aucune pièce expirée ou manquante n’est détectée dans le dossier en base à la date d’ouverture (${input.openingPv.openingDateIso.slice(
          0,
          10
        )}).`,
        legalImpact: 'CRITIQUE',
      });
    }
  }

  // 2. Vérification de la régularité de l'offre de l'attributaire provisoire
  if (winnerBid) {
    if (winnerBid.isArmpExcluded) {
      results.push({
        grievance: "Régularité de l'attributaire provisoire (statut ARMP)",
        verificationSource: 'REGISTRE_ARMP',
        verdict: 'CONFIRME_GRIEF',
        evidenceDetails: `L’attributaire provisoire (${winnerBid.supplierName}) est frappé d’une exclusion ARMP active.`,
        legalImpact: 'CRITIQUE',
      });
    }

    const winnerDocIssues = findExpiredOrMissingDocsAtDate(
      winnerBid,
      input.openingPv.openingDateIso
    );
    if (winnerDocIssues.length > 0) {
      results.push({
        grievance: "Validité des pièces administratives de l'attributaire provisoire",
        verificationSource: 'EXPIRATION_PIECES',
        verdict: 'CONFIRME_GRIEF',
        evidenceDetails: `Anomalie critique sur le dossier de ${winnerBid.supplierName} : ${winnerDocIssues
          .map((d) => d.issue)
          .join(' | ')}`,
        legalImpact: 'CRITIQUE',
      });
    }

    if (winnerBid.isOabSuspected && winnerBid.oabJustificationAccepted !== true) {
      results.push({
        grievance: "Traitement d'une Offre Anormalement Basse (OAB) attribuée",
        verificationSource: 'OFFRE_FINANCIERE',
        verdict: 'CONFIRME_GRIEF',
        evidenceDetails: `L'offre de ${winnerBid.supplierName} (${formatFcfaAmount(
          winnerBid.correctedFinancialTtc ?? winnerBid.financialAmountTtc
        )}) est suspectée d’être anormalement basse sans validation formelle des justifications économiques par la SCA/CPM.`,
        legalImpact: 'CRITIQUE',
      });
    }
  }

  // 3. Contrôle de régularité de la séance d'ouverture
  if (!input.openingPv.quorumReached) {
    results.push({
      grievance: 'Régularité du quorum de la Commission lors de l’ouverture des plis',
      verificationSource: 'PV_OUVERTURE',
      verdict: 'CONFIRME_GRIEF',
      evidenceDetails: `PV ${input.openingPv.pvNumber} : Quorum non atteint (${input.openingPv.presentMembersCount} membre(s) présent(s)).`,
      legalImpact: 'CRITIQUE',
    });
  }

  // 4. Croisement textuel de chaque grief déclaré par le requérant
  for (const grievance of input.grievances) {
    const lower = grievance.toLowerCase();
    if (lower.includes('technique') || lower.includes('note') || lower.includes('score')) {
      if (claimantBid && claimantBid.techScore !== undefined) {
        const minReq = claimantBid.techMinRequiredScore ?? 70;
        const passed = claimantBid.techScore >= minReq;
        results.push({
          grievance,
          verificationSource: 'RAPPORT_SCA',
          verdict:
            passed && claimantBid.techPassed === false ? 'CONFIRME_GRIEF' : 'INFIRME_GRIEF',
          evidenceDetails: `Rapport SCA ${input.scaReport?.reportRef ?? 'N/A'} : Note technique obtenue par ${
            claimantBid.supplierName
          } = ${claimantBid.techScore}/100 (seuil requis DAO : ${minReq}/100).`,
          legalImpact: passed && claimantBid.techPassed === false ? 'CRITIQUE' : 'AUCUN',
        });
      } else {
        results.push({
          grievance,
          verificationSource: 'RAPPORT_SCA',
          verdict: 'A_VERIFIER_COMPLEMENT',
          evidenceDetails: `Se reporter aux grilles détaillées annexées au rapport SCA ${
            input.scaReport?.reportRef ?? 'non référencé'
          }.`,
          legalImpact: 'MINEUR',
        });
      }
    } else if (lower.includes('prix') || lower.includes('financ') || lower.includes('moins-disant') || lower.includes('oab')) {
      const cAmt = claimantBid?.correctedFinancialTtc ?? claimantBid?.financialAmountTtc;
      const wAmt = winnerBid?.correctedFinancialTtc ?? winnerBid?.financialAmountTtc;
      const claimantCheaperWithoutElimination =
        claimantBid &&
        winnerBid &&
        !claimantBid.adminEliminated &&
        claimantBid.techPassed !== false &&
        cAmt !== undefined &&
        wAmt !== undefined &&
        cAmt < wAmt;

      results.push({
        grievance,
        verificationSource: 'OFFRE_FINANCIERE',
        verdict: claimantCheaperWithoutElimination ? 'CONFIRME_GRIEF' : 'INFIRME_GRIEF',
        evidenceDetails: `Comparaison financière : Requérant = ${formatFcfaAmount(
          cAmt
        )} (techPassed=${String(claimantBid?.techPassed)}) vs Attributaire = ${formatFcfaAmount(wAmt)}.`,
        legalImpact: claimantCheaperWithoutElimination ? 'CRITIQUE' : 'AUCUN',
      });
    } else {
      // Grief déjà couvert ou nécessitant vérification documentaire
      const alreadyMatched = results.some(
        (r) =>
          r.verificationSource === 'EXPIRATION_PIECES' ||
          r.verificationSource === 'PV_OUVERTURE'
      );
      if (!alreadyMatched) {
        results.push({
          grievance,
          verificationSource: 'RAPPORT_SCA',
          verdict: 'A_VERIFIER_COMPLEMENT',
          evidenceDetails:
            input.scaReport?.summaryConclusions ??
            'Vérification par confrontation directe avec les pièces annexées au PV et au rapport SCA.',
          legalImpact: 'MINEUR',
        });
      }
    }
  }

  return results;
}

function resolveRiskAndDecision(
  admissibility: AdmissibilityCheckResult,
  crossChecks: FactualCrossCheckItem[]
): {
  riskScore: DisputeRiskScore;
  recommendedDecision: DisputeAuditResult['recommendedDecision'];
} {
  if (admissibility.isForeclosed) {
    return {
      riskScore: 'INFONDE',
      recommendedDecision: 'REJET_FORCLUSION',
    };
  }

  const hasCriticalConfirmed = crossChecks.some(
    (c) => c.verdict === 'CONFIRME_GRIEF' && c.legalImpact === 'CRITIQUE'
  );
  if (hasCriticalConfirmed) {
    return {
      riskScore: 'RISQUE_ELEVE_ANNULATION',
      recommendedDecision: 'ANNULATION_ATTRIBUTION_REEXAMEN_CPM',
    };
  }

  const hasMinorOrPending = crossChecks.some(
    (c) => c.verdict === 'CONFIRME_GRIEF' || c.verdict === 'A_VERIFIER_COMPLEMENT'
  );
  if (hasMinorOrPending) {
    return {
      riskScore: 'VICE_MINEUR',
      recommendedDecision: 'RECTIFICATION_MATERIELLE_SCA',
    };
  }

  return {
    riskScore: 'INFONDE',
    recommendedDecision: 'REJET_AU_FOND_MOTIVE',
  };
}

function buildDeterministicLegalSynthesis(
  input: DisputeAuditInput,
  admissibility: AdmissibilityCheckResult,
  crossChecks: FactualCrossCheckItem[],
  riskScore: DisputeRiskScore,
  recommendedDecision: DisputeAuditResult['recommendedDecision']
): string {
  const lines: string[] = [
    `SYNTHÈSE D'AUDIT JURIDIQUE — RECOURS N° ${input.disputeNumber} (${input.claimantName})`,
    `1. Recevabilité : ${admissibility.admissibilityReasons.join(' ')}`,
    `2. Effet suspensif : ${
      admissibility.suspensionActive
        ? 'ACTIF — Signature du contrat bloquée en base jusqu’à décision définitive.'
        : 'INACTIF (recours forclos ou hors phase de passation).'
    }`,
    `3. Constats factuels issus des pièces en base (PV ${input.openingPv.pvNumber} / SCA ${
      input.scaReport?.reportRef ?? 'N/A'
    }) :`,
    ...crossChecks.map(
      (c, i) => `   (${i + 1}) [${c.verdict} | Impact ${c.legalImpact}] ${c.grievance} -> ${c.evidenceDetails}`
    ),
    `4. Qualification du risque : ${riskScore} — Recommandation : ${recommendedDecision}.`,
  ];
  return lines.join('\n');
}

function buildArmpDefenseMemo(params: {
  input: DisputeAuditInput;
  admissibility: AdmissibilityCheckResult;
  crossChecks: FactualCrossCheckItem[];
  riskScore: DisputeRiskScore;
  recommendedDecision: DisputeAuditResult['recommendedDecision'];
  legalSynthesis: string;
  dateFormatted: string;
}): string {
  const { input, admissibility, crossChecks, dateFormatted } = params;
  const winnerBid = input.bids.find((b) => b.isProvisionalWinner);

  return [
    `RÉPUBLIQUE DU CAMEROUN                          ${input.city}, le ${dateFormatted}`,
    `Paix – Travail – Patrie`,
    `------------------`,
    `${input.entityName.toUpperCase()}`,
    `MAÎTRE D'OUVRAGE / AUTORITÉ CONTRACTANTE`,
    `------------------`,
    `MÉMOIRE EN DÉFENSE DEVANT LE COMITÉ DE RÈGLEMENT DES DIFFÉRENDS (ARMP)`,
    `Recours n° ${input.disputeNumber} — Dossier ${input.projectCode} (${input.tenderNumber})`,
    ``,
    `À MONSIEUR LE DIRECTEUR GÉNÉRAL DE L'AGENCE DE RÉGULATION DES MARCHÉS PUBLICS (ARMP)`,
    `(Comité de Règlement des Différends — Yaoundé)`,
    ``,
    `POUR : ${input.entityName}, représenté par ${input.moSenderName} (${input.moSenderTitle}), Défendeur.`,
    `CONTRE : La société ${input.claimantName}, Soumissionnaire Requérant.`,
    `OBJET : Mémoire en réponse et pièces justificatives sur le recours relatif au DAO n° ${input.tenderNumber} (${input.projectTitle}).`,
    ``,
    `I. RAPPEL DES FAITS ET DE LA PROCÉDURE`,
    `Dans le cadre du projet « ${input.projectTitle} » (Mode : ${input.procurementMode}, Nature : ${input.nature}), la séance d'ouverture des plis s'est tenue le ${input.openingPv.openingDateIso.slice(
      0,
      10
    )} sous la présidence de la ${input.openingPv.commissionType} (PV n° ${input.openingPv.pvNumber}), en présence de ${
      input.openingPv.armpObserverPresent ? "l'Observateur Indépendant désigné" : 'la commission régulièrement constituée'
    }.`,
    winnerBid
      ? `À l'issue des travaux de la Sous-Commission d'Analyse (Rapport ${
          input.scaReport?.reportRef ?? 'N/A'
        }), l'attribution provisoire a été prononcée en faveur de ${winnerBid.supplierName} pour un montant de ${formatFcfaAmount(
          winnerBid.correctedFinancialTtc ?? winnerBid.financialAmountTtc
        )}, publiée le ${admissibility.referenceEventAtIso.slice(0, 10)}.`
      : `Les travaux d'analyse font l'objet du rapport SCA n° ${input.scaReport?.reportRef ?? 'N/A'}.`,
    ``,
    `II. SUR LA RECEVABILITÉ ET L'EFFET SUSPENSIF (DÉCRET N° 2018/366)`,
    ...admissibility.admissibilityReasons.map((r) => `- ${r}`),
    ``,
    `III. DISCUSSION AU FOND — RÉPONSE GRIEF PAR GRIEF`,
    ...crossChecks.map(
      (c, idx) =>
        `${idx + 1}. Grief : ${c.grievance}\n   Source vérifiée (${c.verificationSource}) — Constat : ${c.verdict}\n   Éléments matériels : ${c.evidenceDetails}`
    ),
    ``,
    `IV. SYNTHÈSE JURIDIQUE ET CONCLUSION DU MAÎTRE D'OUVRAGE`,
    params.legalSynthesis,
    ``,
    `PAR CES MOTIFS,`,
    `Plaise au Comité de Règlement des Différends près l'ARMP :`,
    admissibility.isForeclosed
      ? `- À titre principal, déclarer le recours de ${input.claimantName} IRRECEVABLE pour cause de forclusion légale (dépôt au-delà des 5 jours ouvrables) ;`
      : `- Constater que le Maître d'Ouvrage a respecté l'effet suspensif conservatoire durant l'instruction ;`,
    params.recommendedDecision === 'ANNULATION_ATTRIBUTION_REEXAMEN_CPM'
      ? `- Prendre acte des irrégularités relevées et autoriser le renvoi du dossier en Commission pour réexamen régulier conformément au Code des Marchés Publics.`
      : `- Rejeter au fond l'ensemble des griefs articulés par le requérant comme non fondés au regard des pièces du dossier et confirmer la poursuite de la procédure.`,
    ``,
    `V. BORDEREAU DES PIÈCES ANNEXÉES`,
    `1. Copie du DAO n° ${input.tenderNumber} et preuves de publication ;`,
    `2. Procès-verbal d'ouverture des plis n° ${input.openingPv.pvNumber} et feuille de présence ;`,
    `3. Rapport d'analyse de la SCA (${input.scaReport?.reportRef ?? 'copie certifiée'}) et extrait des grilles ;`,
    `4. Copie de la décision d'attribution et preuve de notification/publication ;`,
    `5. Copie des pièces administratives vérifiées et extrait du registre ARMP.`,
    ``,
    `                                        Fait à ${input.city}, le ${dateFormatted}`,
    `                                        ${input.moSenderTitle}`,
    `                                        ${input.moSenderName}`,
  ].join('\n');
}

export async function analyzeAndDraftDisputeResponse(
  input: DisputeAuditInput,
  gatewayRuntime?: GatewayRuntimeOptions
): Promise<DisputeAuditResult> {
  // Étape 1 : Contrôle de recevabilité & forclusion (5 jours ouvrables) + verrou suspensif
  const admissibility = checkDisputeAdmissibility(input);

  // Étape 2 : Croisement factuel déterministe avec les pièces réelles en base
  const factualCrossCheck = crossCheckDisputeFacts(input);

  // Étape 3 : Diagnostic de risque juridique
  const { riskScore, recommendedDecision } = resolveRiskAndDecision(
    admissibility,
    factualCrossCheck
  );

  let legalSynthesis = buildDeterministicLegalSynthesis(
    input,
    admissibility,
    factualCrossCheck,
    riskScore,
    recommendedDecision
  );
  let aiProviderUsed: DisputeAuditResult['aiProviderUsed'];

  if (input.useAiSynthesis) {
    try {
      const legalMatches =
        input.legalChunks && input.legalChunks.length > 0
          ? input.legalChunks
          : searchLocalLegalCorpus(
              `${input.stage} ${input.subject} ${input.groundsSummary} ${input.grievances.join(' ')}`,
              { limit: 4 }
            );
      const ragContext = formatLegalRagContext(legalMatches);
      const aiPrompt = [
        `Dossier : ${input.projectCode} — ${input.projectTitle} (Mode: ${input.procurementMode})`,
        `Recours n° ${input.disputeNumber} introduit par ${input.claimantName} au stade ${input.stage}.`,
        `Objet : ${input.subject}`,
        `Exposé sommaire du requérant : ${input.groundsSummary}`,
        `\nRésultat déterministe de recevabilité (NE PAS CONTREDIRE) : ${JSON.stringify(
          admissibility
        )}`,
        `\nCroisement factuel en base (NE PAS MODIFIER LES PREUVES) : ${JSON.stringify(
          factualCrossCheck
        )}`,
        `\nQualification juridique retenue : ${riskScore} / ${recommendedDecision}`,
        ragContext,
        `\nRédige une synthèse juridique motivée, précise et exploitable par le Maître d'Ouvrage et l'ARMP (maximum 25 lignes).`,
      ].join('\n');

      const aiRes = await invokeAiGateway(
        {
          taskKind: input.offlineMode ? 'OFFLINE_LOCAL' : 'DISPUTE_LEGAL_AUDIT',
          offlineMode: input.offlineMode,
          messages: [
            { role: 'system', content: DISPUTE_LEGAL_AUDITOR_SYSTEM_PROMPT },
            { role: 'user', content: aiPrompt },
          ],
          temperature: 0.15,
          maxTokens: 1600,
        },
        gatewayRuntime
      );
      if (aiRes.content.trim().length > 50) {
        legalSynthesis = aiRes.content.trim();
        aiProviderUsed = aiRes.providerUsed;
      }
    } catch {
      // Fallback silencieux vers la synthèse juridique déterministe
    }
  }

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  // Étape 4A : Génération du projet de réponse motivée du Maître d'Ouvrage
  const moResponse = await generateAdministrativeCorrespondence(
    {
      entityId: input.entityId,
      caseType: 'REPONSE_RECOURS_MO',
      header: {
        entityName: input.entityName,
        entityType: input.entityType,
        serviceLine: "Cabinet du Maître d'Ouvrage / SIGAMP",
        city: input.city,
        chronoNumber: `REP-${input.disputeNumber}`,
        dateFormatted,
        senderRole: 'MO_MOD',
        senderTitle: input.moSenderTitle,
        senderName: input.moSenderName,
        recipientLabel: `Monsieur le Directeur Général de ${input.claimantName}`,
        recipientRank: 'Soumissionnaire Requérant',
        hierarchyDirection: 'EXTERNE_TIERS',
      },
      sqlContext: {
        projectCode: input.projectCode,
        projectTitle: input.projectTitle,
        disputeNumber: input.disputeNumber,
        procurementMode: input.procurementMode,
        commissionType: input.openingPv.commissionType,
        referenceDocument: legalSynthesis,
      },
      useAiRefinement: false,
    },
    gatewayRuntime
  );

  // Étape 4B : Génération simultanée du Mémoire en défense pour l'ARMP
  const armpDefenseMemo = buildArmpDefenseMemo({
    input,
    admissibility,
    crossChecks: factualCrossCheck,
    riskScore,
    recommendedDecision,
    legalSynthesis,
    dateFormatted,
  });

  const legalCitations = [
    'Décret n° 2018/366 du 20 juin 2018 portant Code des Marchés Publics (recours, délai 5 jours ouvrables, effet suspensif)',
    'Décret n° 2013/271 du 05 août 2013 relatif aux Commissions de Passation des Marchés',
    ...(input.entityType === 'COMMUNE' ||
    input.entityType === 'COMMUNAUTE_URBAINE' ||
    input.entityType === 'REGION'
      ? ['Loi n° 2019/024 du 24 décembre 2019 portant CGCTD']
      : []),
  ];

  return {
    disputeNumber: input.disputeNumber,
    admissibility,
    factualCrossCheck,
    riskScore,
    recommendedDecision,
    legalSynthesis,
    legalCitations,
    moResponseDraft: moResponse.fullFormattedDocument,
    armpDefenseMemo,
    aiProviderUsed,
    auditedAtIso: now.toISOString(),
  };
}
