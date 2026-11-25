import 'fake-indexeddb/auto';
import { inflateSync } from 'node:zlib';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as gatewayGet, POST as gatewayPost } from '../../app/api/ai/gateway/route';
import { POST as correspondencePost } from '../../app/api/ai/correspondence/route';
import { POST as disputeAuditPost } from '../../app/api/ai/dispute-audit/route';
import { clearProviderCooldowns, invokeAiGateway } from '../ai/aiGateway';
import { checkDisputeAdmissibility } from '../ai/disputeAnalyzer';
import { anonymizeForAi, deanonymizeAiOutput } from '../ai/privacyAnonymizer';
import { calculateAdjustedCompletionDate } from '../domain/billingEngine';
import { evaluateSecuritiesExpiry } from '../domain/exceptionsEngine';
import {
  CMP_NATURE_THRESHOLDS,
  ENTITY_COMMISSION_RULES,
  routeProcurementProcedure,
} from '../domain/procurementRouter';
import {
  bidirectionalSyncWithSupabase,
  CommandePubliqueOfflineDB,
  generateProvisionalChronoId,
  isProvisionalChronoId,
  pruneClosedRecordsFromLocalCache,
  saveOfflineRecord,
  saveOfflineRecordWithProvisionalChrono,
  type OfflineRecordBase,
  type RemoteSyncTransport,
} from '../offline/offlineStore';
import { generateOfficialPdf } from '../pdf/pdfGenerator';
import {
  checkApiRateLimit,
  resetApiRateLimiter,
} from '../security/apiAuthAndRateLimit';
import { handleAuthSessionMiddleware } from '../supabase/middleware';

describe('V1.1 Axe 1 — Sécurité Auth, Rate Limit & Anonymisation IA', () => {
  beforeEach(() => {
    resetApiRateLimiter();
    clearProviderCooldowns();
  });

  it('anonymise les montants FCFA, NIU, RCCM, entreprises, emails et téléphones puis réinjecte fidèlement les valeurs', () => {
    const rawPrompt =
      "Analyser l'offre de ETS KEMGANG BTP SARL (NIU M041912345678A, RCCM RC/DLA/2021/B/1234) d'un montant de 125 450 000 FCFA TTC. Contact : dg@kemgang-btp.cm / +237 699 12 34 56.";

    const { anonymizedText, tokenMap, stats } = anonymizeForAi(rawPrompt);

    expect(anonymizedText).not.toContain('125 450 000 FCFA');
    expect(anonymizedText).not.toContain('M041912345678A');
    expect(anonymizedText).not.toContain('RC/DLA/2021/B/1234');
    expect(anonymizedText).not.toContain('ETS KEMGANG BTP SARL');
    expect(anonymizedText).not.toContain('dg@kemgang-btp.cm');
    expect(anonymizedText).not.toContain('+237 699 12 34 56');
    expect(stats.amountsMasked).toBeGreaterThanOrEqual(1);
    expect(stats.taxIdsMasked).toBeGreaterThanOrEqual(2);
    expect(stats.companiesMasked).toBeGreaterThanOrEqual(1);
    expect(stats.contactsMasked).toBeGreaterThanOrEqual(2);

    const restored = deanonymizeAiOutput(anonymizedText, tokenMap);
    expect(restored).toBe(rawPrompt);
  });

  it("n'envoie jamais de données brutes sensibles aux providers Cloud dans invokeAiGateway", async () => {
    let sentPayloadBody = '';
    const mockFetch: typeof fetch = vi.fn(async (_url, init) => {
      sentPayloadBody = String(init?.body ?? '');
      // Simuler une réponse Cloud utilisant les jetons anonymisés
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Offre de [ENTREPRISE_1] (NIU [NIU_1]) évaluée à [MONTANT_1].',
              },
            },
          ],
        }),
        { status: 200 }
      );
    });

    const res = await invokeAiGateway(
      {
        taskKind: 'FAST_NLP_COMMAND',
        messages: [
          {
            role: 'user',
            content:
              'Vérifie ETS KEMGANG BTP SARL (NIU M041912345678A) pour 85 000 000 FCFA.',
          },
        ],
      },
      {
        fetchFn: mockFetch,
        config: { groqApiKey: 'gsk_test' },
      }
    );

    expect(sentPayloadBody).not.toContain('85 000 000 FCFA');
    expect(sentPayloadBody).not.toContain('M041912345678A');
    expect(sentPayloadBody).not.toContain('ETS KEMGANG BTP SARL');
    expect(res.content).toContain('ETS KEMGANG BTP SARL');
    expect(res.content).toContain('M041912345678A');
    expect(res.content).toContain('85 000 000 FCFA');
  });

  it('retourne HTTP 401 sans JWT sur /api/ai/* et HTTP 429 + Retry-After au-delà de 30 req/min', async () => {
    const prevBypass = process.env.ALLOW_UNAUTHENTICATED_API_TEST;
    delete process.env.ALLOW_UNAUTHENTICATED_API_TEST;

    const resGateway = await gatewayPost(
      new Request('http://localhost/api/ai/gateway', {
        method: 'POST',
        body: JSON.stringify({ mode: 'gateway', messages: [] }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(resGateway.status).toBe(401);

    const resCorr = await correspondencePost(
      new Request('http://localhost/api/ai/correspondence', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(resCorr.status).toBe(401);

    const resDispute = await disputeAuditPost(
      new Request('http://localhost/api/ai/dispute-audit', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(resDispute.status).toBe(401);

    // Rate limiting 30 req/min sur l'API
    process.env.ALLOW_UNAUTHENTICATED_API_TEST = 'true';
    try {
      for (let i = 0; i < 30; i++) {
        const okRes = await gatewayGet(
          new Request('http://localhost/api/ai/gateway', {
            headers: { 'x-forwarded-for': '41.202.219.10' },
          })
        );
        expect(okRes.status).toBe(200);
      }

      const limitedRes = await gatewayGet(
        new Request('http://localhost/api/ai/gateway', {
          headers: { 'x-forwarded-for': '41.202.219.10' },
        })
      );
      expect(limitedRes.status).toBe(429);
      const retryAfter = Number(limitedRes.headers.get('Retry-After'));
      expect(retryAfter).toBeGreaterThanOrEqual(1);
    } finally {
      if (prevBypass === undefined) delete process.env.ALLOW_UNAUTHENTICATED_API_TEST;
      else process.env.ALLOW_UNAUTHENTICATED_API_TEST = prevBypass;
    }

    // Test unitaire checkApiRateLimit
    const rl = checkApiRateLimit('user:test-rl', { maxRequests: 2, windowMs: 60_000 });
    expect(rl.allowed).toBe(true);
    expect(checkApiRateLimit('user:test-rl', { maxRequests: 2, windowMs: 60_000 }).allowed).toBe(true);
    const blocked = checkApiRateLimit('user:test-rl', { maxRequests: 2, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("redirige (workspace) vers /login si non authentifié en production, tout en laissant /avis et /verify/[sealId] publics", async () => {
    const prevDemo = process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER;
    process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER = 'false';

    try {
      const workspaceReq = new NextRequest('https://sigamp-cm.cm/');
      const workspaceRes = await handleAuthSessionMiddleware(workspaceReq, {
        verifyUserFn: async () => false,
      });
      expect(workspaceRes.status).toBe(307);
      expect(workspaceRes.headers.get('location')).toContain('/login');

      const avisReq = new NextRequest('https://sigamp-cm.cm/avis');
      const avisRes = await handleAuthSessionMiddleware(avisReq);
      expect(avisRes.status).toBe(200);

      const verifyReq = new NextRequest('https://sigamp-cm.cm/verify/SIGAMP-SEAL-DEMO');
      const verifyRes = await handleAuthSessionMiddleware(verifyReq);
      expect(verifyRes.status).toBe(200);

      const authReq = new NextRequest('https://sigamp-cm.cm/', {
        headers: { Authorization: 'Bearer valid-jwt-token' },
      });
      const authRes = await handleAuthSessionMiddleware(authReq, {
        verifyUserFn: async (tok) => tok === 'valid-jwt-token',
      });
      expect(authRes.status).toBe(200);
    } finally {
      if (prevDemo === undefined) delete process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER;
      else process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER = prevDemo;
    }
  });
});

describe('V1.1 Axe 2 — Précision Juridique CMP, Délais OS, Contentieux, PDF ANTIC & Cautions OHADA', () => {
  it('structure les seuils CMP par Nature & Type d’entité (CCCM_TR, CCCM_AG, CCCM_SPI, CCCM_FC)', () => {
    expect(CMP_NATURE_THRESHOLDS.TRAVAUX.cccmThresholdFcfa).toBe(500_000_000);
    expect(CMP_NATURE_THRESHOLDS.FOURNITURES.cccmThresholdFcfa).toBe(250_000_000);
    expect(CMP_NATURE_THRESHOLDS.SERVICES_QUANTIFIABLES.cccmThresholdFcfa).toBe(100_000_000);
    expect(ENTITY_COMMISSION_RULES.REGION.defaultCommission).toBe('CRPM');

    const epFin = routeProcurementProcedure({
      entityType: 'ENTREPRISE_PUBLIQUE',
      nature: 'FOURNITURES',
      estimatedAmountTtc: 300_000_000,
      isFinancialGovernanceScope: true,
    });
    expect(epFin.primaryCommission).toBe('CIPM');
    expect(epFin.requiresCccmPriorOpinion).toBe(true);
    expect(epFin.cccmOrgan).toBe('CCCM_FC');
  });

  it("calcule la date d'achèvement révisée avec OS de démarrage, avenants, paires ARRET/REPRISE et intempéries", () => {
    const res = calculateAdjustedCompletionDate({
      startOrderDateIso: '2026-06-01',
      initialDurationDays: 100,
      amendmentDurationDeltaDays: 20,
      serviceOrders: [
        { osNumber: 'OS-ARR-1', osType: 'ARRET', effectiveDateIso: '2026-07-01' },
        { osNumber: 'OS-REP-1', osType: 'REPRISE', effectiveDateIso: '2026-07-16' }, // +15j
        {
          osNumber: 'OS-INT-1',
          osType: 'TECHNIQUE',
          effectiveDateIso: '2026-08-10',
          weatherExcusedDays: 5,
        },
      ],
      evaluationDateIso: '2026-10-29', // 2026-06-01 + 140j = 2026-10-19 => 10j retard réel
    });

    expect(res.initialCompletionDateIso).toBe('2026-09-09');
    expect(res.suspendedDays).toBe(15);
    expect(res.weatherExcusedDays).toBe(5);
    expect(res.totalAdjustedDurationDays).toBe(140);
    expect(res.revisedCompletionDateIso).toBe('2026-10-19');
    expect(res.actualDelayDays).toBe(10);
    expect(res.isCurrentlySuspended).toBe(false);
    expect(res.suspensionIntervals).toHaveLength(1);
  });

  it('contrôle la recevabilité des recours selon la phase et le cautionnement de recours', () => {
    const missingBond = checkDisputeAdmissibility({
      stage: 'ATTRIBUTION',
      referenceEventAtIso: '2026-05-19T10:00:00.000Z',
      filedAtIso: '2026-05-27T14:00:00.000Z',
      priorMoSeizureVerified: true,
      appealBondRequired: true,
    });
    expect(missingBond.isWithinDeadline).toBe(true);
    expect(missingBond.appealBondProvided).toBe(false);
    expect(missingBond.isAdmissible).toBe(false);
    expect(missingBond.missingAdmissibilityElements.length).toBe(1);

    const execStage = checkDisputeAdmissibility({
      stage: 'EXECUTION',
      referenceEventAtIso: '2026-06-01T10:00:00.000Z',
      filedAtIso: '2026-06-10T10:00:00.000Z',
      priorMoSeizureVerified: true,
      appealBondRequired: true,
      appealBondRef: 'CAUT-ARMP-2026-19',
    });
    expect(execStage.isAdmissible).toBe(true);
    expect(execStage.suspensionActive).toBe(false);
  });

  it('évalue les alertes cautions OHADA & assurances (EXPIRED, CRITICAL <=7j, WARNING 8-30j)', () => {
    const report = evaluateSecuritiesExpiry(
      [
        {
          id: 's-exp',
          contractOrBidRef: 'M-1',
          supplierName: 'ENT A',
          securityType: 'CAUTION_BONNE_EXECUTION',
          issuerInstitution: 'Afriland',
          referenceNumber: 'REF-1',
          amountFcfa: 5_000_000,
          expiryDateIso: '2026-11-20',
        },
        {
          id: 's-crit',
          contractOrBidRef: 'M-2',
          supplierName: 'ENT B',
          securityType: 'CAUTION_AVANCE_DEMARRAGE',
          issuerInstitution: 'BICEC',
          referenceNumber: 'REF-2',
          amountFcfa: 10_000_000,
          expiryDateIso: '2026-11-28',
        },
        {
          id: 's-warn',
          contractOrBidRef: 'M-3',
          supplierName: 'ENT C',
          securityType: 'ASSURANCE_TRC_RC',
          issuerInstitution: 'AXA',
          referenceNumber: 'REF-3',
          amountFcfa: 20_000_000,
          expiryDateIso: '2026-12-10',
        },
        {
          id: 's-released',
          contractOrBidRef: 'M-4',
          supplierName: 'ENT D',
          securityType: 'CAUTION_RETENUE_GARANTIE',
          issuerInstitution: 'SGC',
          referenceNumber: 'REF-4',
          amountFcfa: 3_000_000,
          expiryDateIso: '2026-11-01',
          releasedAtIso: '2026-10-30',
        },
      ],
      new Date('2026-11-23T00:00:00Z')
    );

    expect(report.evaluatedActiveCount).toBe(3);
    expect(report.expiredCount).toBe(1);
    expect(report.criticalCount).toBe(1);
    expect(report.warningCount).toBe(1);
    expect(report.totalAtRiskAmountFcfa).toBe(35_000_000);
    expect(report.alerts[0]?.severity).toBe('EXPIRED');
  });

  it("génère un PDF intégrant la mention légale d'intégrité interne SHA-256 / ANTIC", async () => {
    const pdf = await generateOfficialPdf({
      documentType: 'ORDRE_SERVICE',
      documentNumber: '001/OS/CB/2026',
      title: 'ORDRE DE SERVICE DE DEMARRAGE',
      entityId: '11111111-1111-4111-8111-111111111111',
      entityName: 'Commune de Bafang',
      entityCode: 'CM-OU-BAF',
      city: 'Bafang',
      signatoryTitle: 'Le Maire',
      signatoryName: 'M. le Maire',
      actorUserId: 'u-1',
      actorRole: 'MO_MOD',
      recordTableName: 'generated_correspondences',
      recordId: 'corr-1',
      paragraphs: ['Le titulaire est invité à démarrer les travaux immédiatement.'],
    });

    const buf = Buffer.from(pdf.pdfBytes);
    const latin = buf.toString('latin1');
    const inflatedTexts: string[] = [latin];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(latin)) !== null) {
      try {
        const rawStream = Buffer.from(match[1] ?? '', 'latin1');
        const decompressed = inflateSync(rawStream).toString('latin1');
        const decodedHex = decompressed.replace(/<([0-9a-fA-F]+)>/g, (_m, hex: string) =>
          Buffer.from(hex, 'hex').toString('latin1')
        );
        inflatedTexts.push(decompressed, decodedHex);
      } catch {
        // non-deflate stream (e.g. XObject)
      }
    }
    const allPdfText = inflatedTexts.join('\n');
    expect(allPdfText).toContain('ANTIC');
    expect(allPdfText).toContain('SHA-256');
  });
});

describe('V1.1 Axe 3 — IDs Provisoires Offline & Purge Sélective Cache Local', () => {
  it('génère des IDs provisoires PROV-* hors-ligne et alloue le chrono atomique lors du sync', async () => {
    const prov = generateProvisionalChronoId('PROV', new Date('2026-11-23T14:00:00Z'));
    expect(isProvisionalChronoId(prov)).toBe(true);

    const db = new CommandePubliqueOfflineDB(`v11_chrono_${Date.now()}`);
    await db.open();

    const saved = await saveOfflineRecordWithProvisionalChrono(
      db,
      'generated_correspondences',
      {
        id: 'corr-offline-1',
        entity_id: 'ent-1',
        subject: 'Bordereau transmission DAO',
      },
      {
        chronoField: 'chrono_number',
        docType: 'BT',
        chronoPrefix: 'BT',
        fiscalYear: 2026,
      }
    );

    expect(isProvisionalChronoId(saved.chrono_number)).toBe(true);
    expect(saved.syncStatus).toBe('PENDING');

    let pushedChrono = '';
    const transport: RemoteSyncTransport = {
      async allocateChronoNumber() {
        return 'BT-0042-2026';
      },
      async pushMutation(mut) {
        pushedChrono = String(mut.payload.chrono_number);
        return { ok: true, serverRecord: mut.payload as OfflineRecordBase };
      },
      async uploadAttachment() {
        return { ok: true };
      },
      async pullUpdatedSince() {
        return [];
      },
    };

    const report = await bidirectionalSyncWithSupabase(db, transport, []);
    expect(report.pushedCount).toBe(1);
    expect(pushedChrono).toBe('BT-0042-2026');

    const localAfter = await db.generated_correspondences.get('corr-offline-1');
    expect(localAfter?.chrono_number).toBe('BT-0042-2026');
    expect(localAfter?.syncStatus).toBe('SYNCED');
  });

  it('purge uniquement les dossiers clos SYNCED > 30 jours et préserve PENDING / CONFLICT', async () => {
    const db = new CommandePubliqueOfflineDB(`v11_prune_${Date.now()}`);
    await db.open();

    // 1. Dossier clos SYNCED vieux de 45 jours -> DOIT être purgé
    await db.projects.put({
      id: 'proj-old-closed',
      entity_id: 'ent-1',
      status: 'CLOTURE',
      syncStatus: 'SYNCED',
      closed_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    });

    // 2. Dossier clos récent (10 jours) -> DOIT être conservé
    await db.projects.put({
      id: 'proj-recent-closed',
      entity_id: 'ent-1',
      status: 'CLOTURE',
      syncStatus: 'SYNCED',
      closed_at: '2026-11-13T00:00:00.000Z',
      updated_at: '2026-11-13T00:00:00.000Z',
    });

    // 3. Dossier clos mais avec mutation locale PENDING -> DOIT être préservé
    await saveOfflineRecord(
      db,
      'projects',
      {
        id: 'proj-pending-closed',
        entity_id: 'ent-1',
        status: 'CLOTURE',
        closed_at: '2026-09-15T00:00:00.000Z',
      },
      'UPDATE'
    );

    // 4. Dossier en conflit (> 30j) -> DOIT être préservé
    await db.projects.put({
      id: 'proj-conflict-closed',
      entity_id: 'ent-1',
      status: 'RESILIE',
      syncStatus: 'CONFLICT',
      closed_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    });

    const pruneRes = await pruneClosedRecordsFromLocalCache(
      db,
      30,
      new Date('2026-11-23T00:00:00.000Z')
    );

    expect(pruneRes.prunedCount).toBe(1);
    expect(pruneRes.skippedPendingCount).toBe(2);
    expect(await db.projects.get('proj-old-closed')).toBeUndefined();
    expect(await db.projects.get('proj-recent-closed')).toBeDefined();
    expect(await db.projects.get('proj-pending-closed')).toBeDefined();
    expect(await db.projects.get('proj-conflict-closed')).toBeDefined();
  });
});
