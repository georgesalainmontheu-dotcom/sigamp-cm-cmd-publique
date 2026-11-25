'use client';

import {
  AlertOctagon,
  Clock,
  Gavel,
  Loader2,
  Lock,
  Printer,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import {
  generateOfficialPdf,
  type GeneratedOfficialPdfResult,
} from '../../lib/pdf/pdfGenerator';
import { buildAuthenticatedJsonHeaders } from '../../lib/supabase/client';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';
import type {
  DisputeAuditInput,
  DisputeAuditResult,
  DisputeStage,
} from '../../types/ai';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';

export function DisputeWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [stage, setStage] = useState<DisputeStage>('ATTRIBUTION');
  const [filedAtIso, setFiledAtIso] = useState('2026-05-27T14:00:00.000Z');
  const [referenceEventAtIso, setReferenceEventAtIso] = useState('2026-05-19T10:00:00.000Z');
  const [priorMoVerified, setPriorMoVerified] = useState(true);
  const [appealBondRequired, setAppealBondRequired] = useState(true);
  const [appealBondRef, setAppealBondRef] = useState('CAUT-REC-2026-88');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<DisputeAuditResult | null>(null);
  const [pdfResult, setPdfResult] = useState<GeneratedOfficialPdfResult | null>(null);
  const [activeDocView, setActiveDocView] = useState<'MO' | 'ARMP'>('ARMP');

  const runDisputeAudit = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const payload: DisputeAuditInput = {
        entityId: profile.entityId,
        entityName: profile.entityName,
        entityType: profile.entityType,
        city: profile.city,
        projectId: 'proj-001',
        projectCode: 'BAF-2026-011',
        projectTitle: 'Construction du marché communal de Bafang (Lot 1)',
        tenderNumber: '005/AONO/CB/CDPM/2026',
        procurementMode: 'AONO',
        nature: 'TRAVAUX',
        disputeNumber: 'REC-2026-002',
        stage,
        claimantSupplierId: 'sup-claimant',
        claimantName: 'BTP EXPRESS SARL',
        filedAtIso,
        referenceEventAtIso,
        priorMoSeizureVerified: priorMoVerified,
        appealBondRequired,
        appealBondRef: appealBondRef.trim() || undefined,
        subject: "Contestation de l'attribution provisoire du Lot 1",
        groundsSummary:
          "Le requérant soutient être moins-disant qualifié et dénonce la validité de l'attestation fiscale de l'attributaire provisoire.",
        grievances: [
          'Évaluation technique et classement financier moins-disant contestés',
          "Validité de l'attestation de non-redevance de l'attributaire à l'ouverture des plis",
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
          summaryConclusions: 'Attribution proposée à SOCOBA CAMEROUN SA.',
          keyFindings: ['Vérification pièces et notation technique'],
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
                expiresAt: '2026-04-10T00:00:00.000Z',
                isPresentAtOpening: true,
                isAuthenticVerified: true,
              },
            ],
          },
        ],
        moSenderName: profile.fullName,
        moSenderTitle: profile.title,
        useAiSynthesis: false,
      };

      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/ai/dispute-audit', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setApiError(errBody.error ?? `Erreur serveur (${res.status})`);
        return;
      }
      const json = (await res.json()) as DisputeAuditResult;
      setAuditResult(json);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLegalPdf = async () => {
    if (!auditResult) return;
    const text =
      activeDocView === 'ARMP' ? auditResult.armpDefenseMemo : auditResult.moResponseDraft;
    const pdf = await generateOfficialPdf({
      documentType: 'CORRESPONDANCE',
      documentNumber:
        activeDocView === 'ARMP'
          ? `MEM-ARMP-${auditResult.disputeNumber}`
          : `REP-MO-${auditResult.disputeNumber}`,
      title:
        activeDocView === 'ARMP'
          ? `MEMOIRE EN DEFENSE ARMP — ${auditResult.disputeNumber}`
          : `REPONSE MOTIVEE DU MAITRE D'OUVRAGE — ${auditResult.disputeNumber}`,
      entityId: profile.entityId,
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      city: profile.city,
      projectCode: 'BAF-2026-011',
      signatoryTitle: profile.title,
      signatoryName: profile.fullName,
      actorUserId: profile.userId,
      actorRole: profile.roleCode,
      recordTableName: 'disputes',
      recordId: auditResult.disputeNumber,
      paragraphs: [text],
      ampliations: ['ARMP (Comité de Règlement des Différends)', 'MINMAP', 'Chrono'],
    });
    setPdfResult(pdf);
  };

  return (
    <div className="space-y-6">
      {/* Registre des saisines & Simulateur d'Audit */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
            <Gavel className="h-4 w-4 text-gov-gold" />
            Registre des Saisines &amp; Console d&apos;Audit Juridique IA (5 Jours Ouvrables CM)
          </h2>
          <button
            type="button"
            onClick={() => void runDisputeAudit()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-gov-gold" />}
            Auditer le Recours REC-2026-002
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div>
            <label className="font-semibold text-slate-600">Phase du recours (CMP)</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as DisputeStage)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="PRE_OUVERTURE">PRE_OUVERTURE (5j ouvrables)</option>
              <option value="OUVERTURE_PLIS">OUVERTURE_PLIS (5j ouvrables)</option>
              <option value="ATTRIBUTION">ATTRIBUTION (5j ouvrables)</option>
              <option value="EXECUTION">EXECUTION (phase contractuelle)</option>
              <option value="RESILIATION">RESILIATION (phase résiliation)</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-slate-600">
              Publication / Fait générateur (ISO)
            </label>
            <input
              value={referenceEventAtIso}
              onChange={(e) => setReferenceEventAtIso(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">
              Dépôt Recours (ISO) — ex: 27 mai / 28 mai
            </label>
            <input
              value={filedAtIso}
              onChange={(e) => setFiledAtIso(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">
              Réf. Cautionnement de recours (ARMP)
            </label>
            <input
              value={appealBondRef}
              onChange={(e) => setAppealBondRef(e.target.value)}
              placeholder="Ex: CAUT-REC-2026-88"
              className="mt-1 w-full rounded-lg border px-3 py-2 font-mono"
            />
          </div>
          <label className="flex items-center gap-2 pt-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={priorMoVerified}
              onChange={(e) => setPriorMoVerified(e.target.checked)}
            />
            Saisine préalable du Maître d&apos;Ouvrage vérifiée
          </label>
          <label className="flex items-center gap-2 pt-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={appealBondRequired}
              onChange={(e) => setAppealBondRequired(e.target.checked)}
            />
            Cautionnement de recours exigé
          </label>
        </div>

        {apiError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {apiError}
          </div>
        )}
      </div>

      {auditResult && (
        <div className="space-y-6">
          {/* Alertes Recevabilité & Verrouillage Suspensif */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
            <div
              className={`rounded-2xl border p-4 ${
                auditResult.admissibility.isForeclosed
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <Clock className="h-4 w-4" />
                Recevabilité ({auditResult.admissibility.stage})
              </div>
              <p className="mt-1.5">
                {auditResult.admissibility.isForeclosed
                  ? 'FORCLUSION CONSTATÉE — Dépôt hors délai'
                  : auditResult.admissibility.isAdmissible
                    ? `RECEVABLE (${auditResult.admissibility.businessDaysElapsed}/${auditResult.admissibility.legalDeadlineBusinessDays}j ouvrables)`
                    : `PIÈCE MANQUANTE : ${auditResult.admissibility.missingAdmissibilityElements.join(' ; ')}`}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                auditResult.admissibility.contractSignatureLocked
                  ? 'border-rose-300 bg-rose-50 text-rose-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="h-4 w-4" />
                Effet Suspensif Signature Contrat
              </div>
              <p className="mt-1.5">
                {auditResult.admissibility.contractSignatureLocked
                  ? 'VERROUILLAGE ACTIF — Signature du marché bloquée (Trigger CMP)'
                  : 'INACTIF — Procédure non suspendue'}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                auditResult.riskScore === 'RISQUE_ELEVE_ANNULATION'
                  ? 'border-rose-300 bg-rose-50 text-rose-950'
                  : auditResult.riskScore === 'VICE_MINEUR'
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="h-4 w-4" />
                Diagnostic Juridique : {auditResult.riskScore}
              </div>
              <p className="mt-1.5 font-semibold">{auditResult.recommendedDecision}</p>
            </div>
          </div>

          {/* Tableau Croisement Factuel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gov-navy">
              Croisement Factuel Automatique (PV Ouverture · Rapport SCA · Expiration Pièces · ARMP)
            </h3>
            <div className="mt-3 divide-y divide-slate-100 text-xs">
              {auditResult.factualCrossCheck.map((item, idx) => (
                <div key={idx} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold">
                      {item.verificationSource}
                    </span>
                    <span className="font-semibold text-slate-900">{item.grievance}</span>
                    <span
                      className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        item.verdict === 'CONFIRME_GRIEF'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {item.verdict} ({item.legalImpact})
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{item.evidenceDetails}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Double Génération : Réponse MO & Mémoire ARMP */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDocView('ARMP')}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                    activeDocView === 'ARMP'
                      ? 'bg-gov-navy text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Mémoire en Défense ARMP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDocView('MO')}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold ${
                    activeDocView === 'MO'
                      ? 'bg-gov-navy text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Réponse Motivée du MO
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handlePrintLegalPdf()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gov-gold px-4 py-1.5 text-xs font-semibold text-gov-navy"
              >
                <Printer className="h-3.5 w-3.5" />
                Exporter Acte PDF/QR
              </button>
            </div>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800">
              {activeDocView === 'ARMP'
                ? auditResult.armpDefenseMemo
                : auditResult.moResponseDraft}
            </pre>
          </div>
        </div>
      )}

      {!auditResult && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
          <AlertOctagon className="mx-auto mb-2 h-6 w-6 text-gov-gold" />
          Cliquez sur <strong>Auditer le Recours REC-2026-002</strong> pour tester la forclusion (avec
          jour férié du 20 mai), le verrouillage suspensif du marché et la double génération MO / ARMP.
        </div>
      )}

      <PdfPreviewModal result={pdfResult} onClose={() => setPdfResult(null)} />
    </div>
  );
}
