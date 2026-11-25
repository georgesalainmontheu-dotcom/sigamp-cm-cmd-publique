import { describe, expect, it } from 'vitest';
import {
  buildMaturationProcedurePlan,
  computeDeliverablesMetrics,
  updateDeliverableStatus,
} from '../domain/maturationWorkflowEngine';

describe('Moteur Orchestration Maturation -> Démarche -> Livrables', () => {
  it('génère la démarche complète AONO + EIES + APD pour Travaux >= 50M FCFA en Commune', () => {
    const plan = buildMaturationProcedurePlan({
      projectCode: 'BAF-2026-011',
      projectTitle: 'Construction bloc marchand',
      entityType: 'COMMUNE',
      nature: 'TRAVAUX',
      estimatedAmountTtc: 120_000_000,
      fundingCategory: 'FEICOM',
      urgencyMode: 'NORMALE',
      requiresLandSite: true,
      requiresEnvironmentalNotice: false,
      allotted: false,
    });

    expect(plan.recommendedMode).toBe('AONO');
    expect(plan.contractType).toBe('MARCHE');
    expect(plan.commissionOrgan).toBe('CDPM');
    expect(plan.requiresTutelleVisa).toBe(true);
    expect(
      plan.adaptedMaturationPieces.some((p) => p.pieceType === 'EIES_NOTICE')
    ).toBe(true);
    expect(
      plan.adaptedMaturationPieces.some((p) => p.pieceType === 'APS_APD')
    ).toBe(true);
    expect(
      plan.deliverables.some((d) => d.deliverableCode === 'ACT-DAO-AONO')
    ).toBe(true);
  });

  it('allège la maturation pour Fournitures < 30M (DC_COTATION sans EIES ni APS/APD)', () => {
    const plan = buildMaturationProcedurePlan({
      projectCode: 'BAF-2026-014',
      projectTitle: 'Acquisition matériel informatique',
      entityType: 'COMMUNE',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 24_500_000,
      fundingCategory: 'BUDGET_PROPRE',
      urgencyMode: 'NORMALE',
      requiresLandSite: false,
      requiresEnvironmentalNotice: false,
      allotted: false,
    });

    expect(plan.recommendedMode).toBe('DC_COTATION');
    expect(plan.contractType).toBe('LETTRE_COMMANDE');
    expect(
      plan.adaptedMaturationPieces.some((p) => p.pieceType === 'APS_APD')
    ).toBe(false);
    expect(
      plan.adaptedMaturationPieces.some((p) => p.pieceType === 'EIES_NOTICE')
    ).toBe(false);
    expect(
      plan.deliverables.some((d) => d.deliverableCode === 'ACT-DC-COTATION')
    ).toBe(true);
  });

  it('route un montant < 5M vers BCA rapide sans DAO ni Commission', () => {
    const plan = buildMaturationProcedurePlan({
      projectCode: 'MIN-2026-002',
      projectTitle: 'Fournitures de bureau',
      entityType: 'MINISTERE',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 3_800_000,
      fundingCategory: 'BIP_ETAT',
      urgencyMode: 'NORMALE',
      requiresLandSite: false,
      requiresEnvironmentalNotice: false,
      allotted: false,
    });

    expect(plan.contractType).toBe('BON_COMMANDE_ADMINISTRATIF');
    expect(plan.deliverables.some((d) => d.deliverableCode === 'ACT-BCA-VISE')).toBe(
      true
    );
  });

  it('active la procédure Gré à Gré + accord MINMAP en cas d’urgence impérieuse', () => {
    const plan = buildMaturationProcedurePlan({
      projectCode: 'PREF-2026-URG',
      projectTitle: 'Réparation pont emporté',
      entityType: 'PREFECTURE',
      nature: 'TRAVAUX',
      estimatedAmountTtc: 85_000_000,
      fundingCategory: 'BIP_ETAT',
      urgencyMode: 'URGENCE_IMPERIEUSE',
      requiresLandSite: false,
      requiresEnvironmentalNotice: false,
      allotted: false,
    });

    expect(plan.recommendedMode).toBe('GRE_A_GRE');
    expect(
      plan.deliverables.some((d) => d.deliverableCode === 'ACT-MINMAP-GAG')
    ).toBe(true);
  });

  it('suit le statut des livrables et déverrouille la consultation quand Phase 1-2 sont validés', () => {
    const plan = buildMaturationProcedurePlan({
      projectCode: 'TEST-2026-01',
      projectTitle: 'Test suivi',
      entityType: 'COMMUNE',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 4_000_000,
      fundingCategory: 'BUDGET_PROPRE',
      urgencyMode: 'NORMALE',
      requiresLandSite: false,
      requiresEnvironmentalNotice: false,
      allotted: false,
    });

    const initialMetrics = computeDeliverablesMetrics(plan.deliverables);
    expect(initialMetrics.canLaunchConsultation).toBe(false);
    expect(initialMetrics.progressPercent).toBe(0);

    let updated = plan.deliverables;
    for (const item of updated.filter((d) => d.phase <= 2 && d.blocking)) {
      updated = updateDeliverableStatus(updated, item.id, {
        status: 'SIGNE_ARCHIVE_GED',
        documentRef: `REF-${item.stepNumber}`,
      });
    }

    const readyMetrics = computeDeliverablesMetrics(updated);
    expect(readyMetrics.canLaunchConsultation).toBe(true);
    expect(readyMetrics.blockingPendingCount).toBe(0);
    expect(readyMetrics.progressPercent).toBeGreaterThan(0);
  });

  it('injecte les règles CMS d’entité (Workflows, Membres de Commission, GED) dans la feuille de route', () => {
    const plan = buildMaturationProcedurePlan(
      {
        projectCode: 'BAF-2026-CMS',
        projectTitle: 'Extension réseau éclairage public',
        entityType: 'COMMUNE',
        nature: 'TRAVAUX',
        estimatedAmountTtc: 95_000_000,
        fundingCategory: 'BUDGET_PROPRE',
        urgencyMode: 'NORMALE',
        requiresLandSite: true,
        requiresEnvironmentalNotice: false,
        allotted: false,
      },
      {
        workflowRules: [
          {
            id: 'wf-aono',
            procedureLabel: 'AONO Travaux >= 50M',
            thresholdRange: '>= 50 000 000 FCFA',
            steps: ['Maturation', 'DAO', 'Commission'],
            maxLegalDays: 25,
            blockingControl: true,
            active: true,
          },
        ],
        commissionMembers: [
          {
            id: 'cm-1',
            fullName: 'M. Jean-Paul Njoya',
            roleInCommission: 'Président CDPM',
            organ: 'CDPM',
            appointmentRef: 'ARR-2026-01',
            indemnityFcfa: 75_000,
            active: true,
          },
        ],
        gedPolicy: {
          retentionYears: 10,
          autoSealQr: true,
          requireDigitalSignature: true,
          watermarkDrafts: true,
          allowPublicAvisPortal: true,
          webhookUrl: '',
        },
      }
    );

    expect(plan.appliedCmsSummary).toContain('AONO Travaux >= 50M');
    expect(plan.appliedCmsSummary).toContain('Jean-Paul Njoya');
    expect(plan.appliedCmsSummary).toContain('rétention 10 ans');
    const pubItem = plan.deliverables.find((d) => d.deliverableCode === 'ACT-PUB-AAO');
    expect(pubItem?.targetDays).toBe(25);
    const examItem = plan.deliverables.find((d) => d.deliverableCode === 'ACT-PV-EXAM-DAO');
    expect(examItem?.deliverableTitle).toContain('Jean-Paul Njoya');
  });
});
