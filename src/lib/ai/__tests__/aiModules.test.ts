import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GET as correspondenceGet,
  POST as correspondencePost,
} from '../../../app/api/ai/correspondence/route';
import { POST as disputeAuditPost } from '../../../app/api/ai/dispute-audit/route';
import {
  GET as gatewayGet,
  POST as gatewayPost,
} from '../../../app/api/ai/gateway/route';
import type {
  AiToolExecutionContext,
  DisputeAuditInput,
} from '../../../types/ai';
import type { IndemnityScale } from '../../domain/indemnityEngine';
import {
  buildProviderChain,
  clearProviderCooldowns,
  generateEmbedding768,
  invokeAiGateway,
} from '../aiGateway';
import {
  executeAiToolCall,
  runAgenticWorkflow,
} from '../aiTools';
import {
  generateAdministrativeCorrespondence,
  learnTemplateFromValidatedDocument,
} from '../correspondenceGenerator';
import { analyzeAndDraftDisputeResponse } from '../disputeAnalyzer';

const SAMPLE_CONTEXT: AiToolExecutionContext = {
  entityId: '11111111-1111-4111-8111-111111111111',
  entityName: 'Commune de Bafang',
  entityType: 'COMMUNE',
  city: 'Bafang',
  fiscalYear: 2026,
  actorUserId: '22222222-2222-4222-8222-222222222222',
  actorRole: 'SIGAMP',
  actorName: 'Jean-Paul Kamdem',
  actorTitle: 'Le Chef du SIGAMP',
};

describe('Jalon 3 — Passerelle IA Multi-Fournisseurs & Auto-Fallback', () => {
  beforeEach(() => {
    clearProviderCooldowns();
  });

  it('route intelligemment chaque tâche vers son fournisseur optimal et isole le mode hors-ligne', () => {
    expect(buildProviderChain('LONG_DOC_ANALYSIS')[0]).toBe('gemini');
    expect(buildProviderChain('FAST_NLP_COMMAND')[0]).toBe('groq');
    expect(buildProviderChain('FRANCOPHONE_DRAFTING')[0]).toBe('mistral');
    expect(buildProviderChain('FAST_NLP_COMMAND', true)).toEqual(['ollama']);
  });

  it('bascule automatiquement sur HTTP 429 (Groq -> Mistral -> Ollama) et applique un cooldown', async () => {
    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      calledUrls.push(url);

      if (url.includes('api.groq.com')) {
        return new Response('Rate limit exceeded', {
          status: 429,
          headers: { 'retry-after': '45' },
        });
      }
      if (url.includes('api.mistral.ai')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Réponse Mistral après bascule 429.' } }],
            usage: { prompt_tokens: 15, completion_tokens: 8, total_tokens: 23 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not expected', { status: 500 });
    });

    const res1 = await invokeAiGateway(
      {
        taskKind: 'FAST_NLP_COMMAND',
        messages: [{ role: 'user', content: 'Calcule les pénalités.' }],
      },
      {
        fetchFn: mockFetch,
        config: {
          groqApiKey: 'gsk_test',
          mistralApiKey: 'mst_test',
          geminiApiKey: 'gem_test',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
        },
      }
    );

    expect(res1.providerUsed).toBe('mistral');
    expect(res1.isOfflineFallback).toBe(false);
    expect(res1.attempts[0]?.outcome).toBe('RATE_LIMITED_429');
    expect(res1.attempts[1]?.outcome).toBe('SUCCESS');

    // Deuxième appel : Groq doit être sauté (SKIPPED_COOLDOWN) sans requête réseau
    const res2 = await invokeAiGateway(
      {
        taskKind: 'FAST_NLP_COMMAND',
        messages: [{ role: 'user', content: 'Autre commande.' }],
      },
      {
        fetchFn: mockFetch,
        config: {
          groqApiKey: 'gsk_test',
          mistralApiKey: 'mst_test',
          geminiApiKey: 'gem_test',
        },
      }
    );

    expect(res2.providerUsed).toBe('mistral');
    expect(res2.attempts[0]?.outcome).toBe('SKIPPED_COOLDOWN');
    expect(calledUrls.filter((u) => u.includes('api.groq.com')).length).toBe(1);
  });

  it('bascule sur Ollama local si toutes les API cloud échouent ou atteignent leurs quotas', async () => {
    const mockFetch: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('generativelanguage.googleapis.com') || url.includes('mistral') || url.includes('groq')) {
        return new Response('Quota exceeded', { status: 429 });
      }
      if (url.includes('/api/chat')) {
        return new Response(
          JSON.stringify({
            message: { content: 'Réponse locale souveraine Ollama.' },
            prompt_eval_count: 20,
            eval_count: 10,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Unknown', { status: 404 });
    });

    const res = await invokeAiGateway(
      {
        taskKind: 'LONG_DOC_ANALYSIS',
        messages: [{ role: 'user', content: 'Analyse ce DAO.' }],
      },
      {
        fetchFn: mockFetch,
        config: {
          geminiApiKey: 'gem_test',
          mistralApiKey: 'mst_test',
          groqApiKey: 'gsk_test',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
        },
      }
    );

    expect(res.providerUsed).toBe('ollama');
    expect(res.isOfflineFallback).toBe(true);
    expect(res.content).toContain('Ollama');
  });

  it('génère des embeddings 768d via Gemini puis Ollama en secours', async () => {
    const mockFetch: typeof fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('embedContent')) {
        return new Response('Too many requests', { status: 429 });
      }
      if (url.includes('/api/embeddings')) {
        return new Response(
          JSON.stringify({ embedding: Array.from({ length: 768 }, () => 0.01) }),
          { status: 200 }
        );
      }
      return new Response('Err', { status: 500 });
    });

    const emb = await generateEmbedding768('Article 90 Décret 2018/366', {
      fetchFn: mockFetch,
      config: { geminiApiKey: 'gem_test', ollamaBaseUrl: 'http://127.0.0.1:11434' },
    });

    expect(emb.provider).toBe('ollama');
    expect(emb.embedding).toHaveLength(768);
  });
});

describe('Jalon 3 — Agentic Workflow & Function Calling', () => {
  beforeEach(() => {
    clearProviderCooldowns();
  });

  it('exécute les outils métier déterministes (pénalités avec déduction intempéries et indemnités)', async () => {
    const penRes = await executeAiToolCall(
      {
        id: 'tc_1',
        name: 'calculate_delay_penalties_with_weather',
        arguments: {
          contractNumber: 'M-2026-009',
          contractAmountTtc: 100_000_000,
          delayDays: 40,
          weatherExcusedDays: 10,
        },
      },
      SAMPLE_CONTEXT
    );

    expect(penRes.success).toBe(true);
    expect(penRes.data?.netDelayDays).toBe(30);
    // 30j * 100M / 2000 = 1 500 000 FCFA
    expect(penRes.data?.cappedPenaltyFcfa).toBe(1_500_000);

    const scales: IndemnityScale[] = [
      {
        id: 'sc-1',
        entityId: null,
        fiscalYear: 2026,
        scaleName: 'Barème CDPM',
        legalReference: 'Décret Barèmes',
        commissionType: 'CDPM',
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
        sessionCapFcfa: null,
        monthlyCapFcfa: null,
        annualCapFcfa: null,
        active: true,
      },
    ];

    const indRes = await executeAiToolCall(
      {
        id: 'tc_2',
        name: 'liquidate_session_indemnities',
        arguments: {
          triggerEvent: 'OUVERTURE_PLIS',
          commissionType: 'CDPM',
          procurementMode: 'AONO',
          contractAmountTtc: 40_000_000,
          lotsCount: 2,
          bidsCount: 4,
          scales,
          attendances: [
            {
              attendanceId: 'att-1',
              userId: 'u-1',
              fullName: 'Président CDPM',
              roleCode: 'CPM_PRESIDENT',
              isPresent: true,
            },
            {
              attendanceId: 'att-2',
              userId: 'u-2',
              fullName: 'Membre Absent',
              roleCode: 'CPM_PRESIDENT',
              isPresent: false,
            },
          ],
          budgetLine: {
            budgetLineId: 'bl-1',
            chapitre: '62',
            article: '6210',
            initialAllocationFcfa: 5_000_000,
            committedFcfa: 0,
          },
        },
      },
      SAMPLE_CONTEXT
    );

    expect(indRes.success).toBe(true);
    expect(indRes.data?.totalGrossFcfa).toBe(60_000); // 50k + 10k lot supp
    expect((indRes.data?.excludedActors as unknown[]).length).toBe(1);
  });

  it('orchestre une boucle agentique complète Groq Function Calling -> Moteur Jalon 2 -> Réponse', async () => {
    let callStep = 0;
    const mockFetch: typeof fetch = vi.fn(async () => {
      callStep += 1;
      if (callStep === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_proj_1',
                      function: {
                        name: 'create_procurement_project',
                        arguments: JSON.stringify({
                          projectCode: 'BAF-2026-011',
                          title: 'Construction de 03 salles de classe à Bafang',
                          nature: 'TRAVAUX',
                          estimatedAmountTtc: 45_000_000,
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Le projet BAF-2026-011 a été créé et routé en Lettre-Commande (AONO) devant la CDPM.',
              },
            },
          ],
        }),
        { status: 200 }
      );
    });

    const workflow = await runAgenticWorkflow({
      userPrompt:
        'Crée le projet BAF-2026-011 de construction de 3 salles de classe pour 45 millions FCFA TTC.',
      context: SAMPLE_CONTEXT,
      gatewayRuntime: {
        fetchFn: mockFetch,
        config: { groqApiKey: 'gsk_test' },
      },
    });

    expect(workflow.providerUsed).toBe('groq');
    expect(workflow.toolExecutions).toHaveLength(1);
    expect(workflow.toolExecutions[0]?.success).toBe(true);
    expect(workflow.answer).toContain('CDPM');
  });
});

describe('Jalon 3 — Rédaction Administrative & Apprentissage de Modèles', () => {
  it('génère un Bordereau de Transmission camerounais complet avec injection SQL et formules hiérarchiques', async () => {
    const doc = await generateAdministrativeCorrespondence({
      entityId: SAMPLE_CONTEXT.entityId,
      caseType: 'BORDEREAU_TRANSMISSION',
      header: {
        entityName: 'Commune de Bafang',
        entityType: 'COMMUNE',
        serviceLine: 'SIGAMP — Commune de Bafang',
        city: 'Bafang',
        chronoNumber: '024/BT/CB/SIGAMP/2026',
        dateFormatted: '23 novembre 2026',
        senderRole: 'SIGAMP',
        senderTitle: 'Le Maire de la Commune de Bafang',
        senderName: 'M. le Maire',
        recipientLabel: 'Monsieur le Président de la CDPM du Haut-Nkam',
        recipientRank: 'Président CDPM',
        hierarchyDirection: 'EGALITAIRE',
      },
      sqlContext: {
        projectCode: 'BAF-2026-011',
        projectTitle: 'Réhabilitation voirie urbaine',
        fiscalYear: 2026,
        amountTtcFcfa: 48_500_000,
        procurementMode: 'AONO',
        commissionType: 'CDPM',
        attachmentsList: [
          {
            designation: 'Projet de DAO + Plans techniques',
            copiesCount: 5,
            observations: 'Pour examen et avis',
          },
        ],
      },
    });

    expect(doc.fullFormattedDocument).toContain('RÉPUBLIQUE DU CAMEROUN');
    expect(doc.fullFormattedDocument).toContain('024/BT/CB/SIGAMP/2026');
    expect(doc.fullFormattedDocument).toContain('Réhabilitation voirie urbaine');
    expect(doc.fullFormattedDocument).toContain('Ampliations :');
    expect(doc.bodyRendered).toContain("J'ai l'honneur de vous transmettre");
  });

  it("capitalise un document validé en modèle réutilisable paramétré et détecte les doublons", async () => {
    const sqlCtx = {
      projectCode: 'BAF-2026-011',
      projectTitle: 'Réhabilitation voirie urbaine',
      contractNumber: 'LC-2026-004/CB',
      supplierName: 'ETS KEMGANG BTP SARL',
      amountTtcFcfa: 48_500_000,
      gracePeriodDays: 18,
      deadlineDateFormatted: '11 décembre 2026',
    };

    const generated = await generateAdministrativeCorrespondence({
      entityId: SAMPLE_CONTEXT.entityId,
      caseType: 'MISE_EN_DEMEURE',
      header: {
        entityName: 'Commune de Bafang',
        entityType: 'COMMUNE',
        serviceLine: 'SIGAMP',
        city: 'Bafang',
        chronoNumber: '030/OS-MED/CB/2026',
        dateFormatted: '23 novembre 2026',
        senderRole: 'MO_MOD',
        senderTitle: 'Le Maire',
        senderName: 'M. le Maire',
        recipientLabel: 'ETS KEMGANG BTP SARL',
        recipientRank: 'Titulaire',
        hierarchyDirection: 'EXTERNE_TIERS',
      },
      sqlContext: sqlCtx,
    });

    const proposal = learnTemplateFromValidatedDocument({
      entityId: SAMPLE_CONTEXT.entityId,
      roleOwner: 'MO_MOD',
      caseType: 'MISE_EN_DEMEURE',
      administrativeRankTarget: 'Entreprise Titulaire',
      hierarchyDirection: 'EXTERNE_TIERS',
      validatedSubject: generated.subject,
      validatedBody: generated.bodyRendered,
      sqlContextUsed: sqlCtx,
    });

    expect(proposal.shouldPersist).toBe(true);
    expect(proposal.template.isValidatedBestPractice).toBe(true);
    expect(proposal.template.bodyTemplate).toContain('{{supplier_name}}');
    expect(proposal.template.bodyTemplate).toContain('{{contract_number}}');
    expect(proposal.extractedPlaceholders).toContain('supplier_name');

    // Ré-apprentissage quasi-identique -> ne doit pas créer de doublon
    const duplicateProposal = learnTemplateFromValidatedDocument({
      entityId: SAMPLE_CONTEXT.entityId,
      roleOwner: 'MO_MOD',
      caseType: 'MISE_EN_DEMEURE',
      administrativeRankTarget: 'Entreprise Titulaire',
      hierarchyDirection: 'EXTERNE_TIERS',
      validatedSubject: generated.subject,
      validatedBody: generated.bodyRendered,
      sqlContextUsed: sqlCtx,
      existingTemplates: [proposal.template],
    });
    expect(duplicateProposal.shouldPersist).toBe(false);
  });
});

describe('Jalon 3 — Assistant d’Audit & Réponse aux Contentieux', () => {
  function buildBaseDisputeInput(overrides?: Partial<DisputeAuditInput>): DisputeAuditInput {
    return {
      entityId: SAMPLE_CONTEXT.entityId,
      entityName: 'Commune de Bafang',
      entityType: 'COMMUNE',
      city: 'Bafang',
      projectId: 'proj-1',
      projectCode: 'BAF-2026-011',
      projectTitle: 'Construction du marché communal',
      tenderNumber: '005/AONO/CB/CDPM/2026',
      procurementMode: 'AONO',
      nature: 'TRAVAUX',
      disputeNumber: 'REC-2026-002',
      stage: 'ATTRIBUTION',
      claimantSupplierId: 'sup-claimant',
      claimantName: 'BTP EXPRESS SARL',
      // Publication mardi 19 mai 2026 -> 20 mai est férié !
      // 5 jours ouvrables après 19/05 = 21(1), 22(2), 25(3), 26(4), 27(5) mai 2026
      referenceEventAtIso: '2026-05-19T10:00:00.000Z',
      filedAtIso: '2026-05-27T14:00:00.000Z',
      priorMoSeizureVerified: true,
      subject: "Contestation de l'attribution provisoire du lot 1",
      groundsSummary:
        "Le requérant conteste son élimination et dénonce la validité des pièces de l'attributaire.",
      grievances: [
        "Élimination injustifiée et évaluation technique contestée",
        'Prix moins-disant non retenu',
      ],
      openingPv: {
        pvNumber: 'PV-OUV-005/2026',
        openingDateIso: '2026-04-15T10:00:00.000Z',
        submissionDeadlineIso: '2026-04-15T09:00:00.000Z',
        commissionType: 'CDPM',
        presentMembersCount: 5,
        quorumReached: true,
        armpObserverPresent: true,
        incidentsNoted: [],
      },
      scaReport: {
        reportRef: 'RAP-SCA-005/2026',
        summaryConclusions: 'Proposition d’attribution au moins-disant qualifié.',
        keyFindings: ['Contrôle des pièces administratives et notation technique'],
      },
      bids: [
        {
          bidId: 'bid-claimant',
          supplierId: 'sup-claimant',
          supplierName: 'BTP EXPRESS SARL',
          isClaimant: true,
          isProvisionalWinner: false,
          lotNumber: 1,
          submittedAtIso: '2026-04-15T08:30:00.000Z',
          isLate: false,
          isArmpExcluded: false,
          adminEliminated: false,
          eliminationReasons: [],
          techScore: 82,
          techMinRequiredScore: 70,
          techPassed: true,
          financialAmountHt: 80_000_000,
          financialAmountTtc: 95_400_000,
          correctedFinancialTtc: 95_400_000,
          bidBondAmountFcfa: 2_000_000,
          requiredBidBondFcfa: 2_000_000,
          adminDocuments: [
            {
              docType: 'ATTESTATION_NON_REDEVANCE',
              documentRef: 'ANR-2026-101',
              expiresAt: '2026-06-30T00:00:00.000Z',
              isPresentAtOpening: true,
              isAuthenticVerified: true,
            },
          ],
        },
        {
          bidId: 'bid-winner',
          supplierId: 'sup-winner',
          supplierName: 'SOCOBA CAMEROUN SA',
          isClaimant: false,
          isProvisionalWinner: true,
          lotNumber: 1,
          submittedAtIso: '2026-04-15T08:45:00.000Z',
          isLate: false,
          isArmpExcluded: false,
          adminEliminated: false,
          eliminationReasons: [],
          techScore: 85,
          techMinRequiredScore: 70,
          techPassed: true,
          financialAmountHt: 84_000_000,
          financialAmountTtc: 100_170_000,
          correctedFinancialTtc: 100_170_000,
          bidBondAmountFcfa: 2_000_000,
          requiredBidBondFcfa: 2_000_000,
          adminDocuments: [
            {
              docType: 'ATTESTATION_NON_REDEVANCE',
              documentRef: 'ANR-2026-019',
              // Expirée AVANT le 15 avril 2026 -> vice critique !
              expiresAt: '2026-04-10T00:00:00.000Z',
              isPresentAtOpening: true,
              isAuthenticVerified: true,
            },
          ],
        },
      ],
      moSenderName: 'M. le Maire',
      moSenderTitle: 'Le Maire de la Commune de Bafang',
      ...overrides,
    };
  }

  it('respecte le jour férié du 20 mai, active le verrou suspensif, détecte une pièce expirée de l’attributaire et génère les 2 actes', async () => {
    const result = await analyzeAndDraftDisputeResponse(buildBaseDisputeInput());

    // Déposé le 27/05/2026 (5e jour ouvrable après 19/05 car 20/05 férié + 23-24 week-end)
    expect(result.admissibility.isWithinDeadline).toBe(true);
    expect(result.admissibility.isForeclosed).toBe(false);
    expect(result.admissibility.suspensionActive).toBe(true);
    expect(result.admissibility.contractSignatureLocked).toBe(true);

    // Détection critique de la pièce expirée de l'attributaire + moins-disant qualifié non retenu
    expect(result.riskScore).toBe('RISQUE_ELEVE_ANNULATION');
    expect(result.recommendedDecision).toBe('ANNULATION_ATTRIBUTION_REEXAMEN_CPM');
    expect(
      result.factualCrossCheck.some(
        (c) =>
          c.verificationSource === 'EXPIRATION_PIECES' &&
          c.verdict === 'CONFIRME_GRIEF' &&
          c.legalImpact === 'CRITIQUE'
      )
    ).toBe(true);

    // Génération simultanée de la réponse MO et du mémoire en défense ARMP
    expect(result.moResponseDraft).toContain('REC-2026-002');
    expect(result.armpDefenseMemo).toContain("MÉMOIRE EN DÉFENSE DEVANT LE COMITÉ DE RÈGLEMENT DES DIFFÉRENDS (ARMP)");
    expect(result.armpDefenseMemo).toContain('V. BORDEREAU DES PIÈCES ANNEXÉES');
  });

  it('rejette pour forclusion au-delà des 5 jours ouvrables sans activer le verrou suspensif', async () => {
    const result = await analyzeAndDraftDisputeResponse(
      buildBaseDisputeInput({
        // 28 mai 2026 = 6e jour ouvrable -> Forclos !
        filedAtIso: '2026-05-28T09:00:00.000Z',
      })
    );

    expect(result.admissibility.isWithinDeadline).toBe(false);
    expect(result.admissibility.isForeclosed).toBe(true);
    expect(result.admissibility.suspensionActive).toBe(false);
    expect(result.admissibility.contractSignatureLocked).toBe(false);
    expect(result.recommendedDecision).toBe('REJET_FORCLUSION');
    expect(result.armpDefenseMemo).toContain('IRRECEVABLE pour cause de forclusion légale');
  });
});

describe('Jalon 3 — Routes API Next.js App Router', () => {
  it('expose GET /api/ai/gateway et valide les requêtes POST', async () => {
    const getRes = await gatewayGet();
    expect(getRes.status).toBe(200);
    const json = (await getRes.json()) as { status: string; availableTools: string[] };
    expect(json.status).toBe('ok');
    expect(json.availableTools).toContain('create_procurement_project');

    const badPost = await gatewayPost(
      new Request('http://localhost/api/ai/gateway', {
        method: 'POST',
        body: JSON.stringify({ mode: 'gateway', messages: [] }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(badPost.status).toBe(400);

    const corrGet = await correspondenceGet();
    expect(corrGet.status).toBe(200);

    const badCorr = await correspondencePost(
      new Request('http://localhost/api/ai/correspondence', {
        method: 'POST',
        body: JSON.stringify({ action: 'learn' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(badCorr.status).toBe(400);

    const badDispute = await disputeAuditPost(
      new Request('http://localhost/api/ai/dispute-audit', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    expect(badDispute.status).toBe(400);
  });
});
