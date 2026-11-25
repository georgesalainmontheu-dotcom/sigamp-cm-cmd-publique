'use client';

import {
  Calculator,
  CheckCircle2,
  Landmark,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculateDecompte } from '../../lib/domain/billingEngine';
import { evaluateSecuritiesExpiry } from '../../lib/domain/exceptionsEngine';
import {
  generateOfficialPdf,
  type GeneratedOfficialPdfResult,
} from '../../lib/pdf/pdfGenerator';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';
import type { ContractType, FiscalRegime } from '../../types/domain';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';

interface VisaQueueItem {
  id: string;
  reference: string;
  kind: 'ENGAGEMENT_MARCHE' | 'ETAT_INDEMNITES' | 'DECOMPTE';
  label: string;
  amountFcfa: number;
  budgetAvailableFcfa: number;
  status: 'EN_ATTENTE_VISA_CF' | 'VISA_ACCORDE' | 'REJETE_INSUFFISANCE';
}

export function FinanceControllerWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [visaQueue, setVisaQueue] = useState<VisaQueueItem[]>([
    {
      id: 'vq-1',
      reference: 'LIQ-IND-2026-004',
      kind: 'ETAT_INDEMNITES',
      label: 'Indemnités Ouverture Plis CDPM — Dossier BAF-2026-011',
      amountFcfa: 166_000,
      budgetAvailableFcfa: 5_300_000,
      status: 'EN_ATTENTE_VISA_CF',
    },
    {
      id: 'vq-2',
      reference: 'ENG-2026-018',
      kind: 'ENGAGEMENT_MARCHE',
      label: 'Engagement Marché Réhabilitation Voirie Lot 1',
      amountFcfa: 112_500_000,
      budgetAvailableFcfa: 120_000_000,
      status: 'EN_ATTENTE_VISA_CF',
    },
  ]);

  // Calculateur Décompte (Moteur 2)
  const [contractType, setContractType] = useState<ContractType>('MARCHE');
  const [contractTtc, setContractTtc] = useState(119_250_000);
  const [grossHt, setGrossHt] = useState(25_000_000);
  const [fiscalRegime, setFiscalRegime] = useState<FiscalRegime>('REEL');
  const [hasNonRedevance, setHasNonRedevance] = useState(true);
  const [advanceRate, setAdvanceRate] = useState(0.2);
  const [hasGuaranteeBond, setHasGuaranteeBond] = useState(false);
  const [delayDays, setDelayDays] = useState(12);
  const [weatherDays, setWeatherDays] = useState(4);
  const [pdfResult, setPdfResult] = useState<GeneratedOfficialPdfResult | null>(null);

  const decompte = useMemo(
    () =>
      calculateDecompte({
        contractType,
        contractInitialAmountTtc: Math.max(1, contractTtc),
        grossAmountHt: Math.max(0, grossHt),
        fiscalRegime,
        hasValidNonRedevance: hasNonRedevance,
        startAdvanceProrataRate: advanceRate,
        hasReplacementGuaranteeBond: hasGuaranteeBond,
        delayDays,
        weatherExcusedDays: weatherDays,
      }),
    [
      contractType,
      contractTtc,
      grossHt,
      fiscalRegime,
      hasNonRedevance,
      advanceRate,
      hasGuaranteeBond,
      delayDays,
      weatherDays,
    ]
  );

  const grantVisa = (id: string) => {
    setVisaQueue((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        return {
          ...q,
          status:
            q.budgetAvailableFcfa >= q.amountFcfa
              ? 'VISA_ACCORDE'
              : 'REJETE_INSUFFISANCE',
        };
      })
    );
  };

  const handlePrintDecomptePdf = async () => {
    const pdf = await generateOfficialPdf({
      documentType: 'DECOMPTE',
      documentNumber: 'DEC-2026-003/M-011',
      title: 'DECOMPTE PROVISOIRE DE TRAVAUX & LIQUIDATION FISCALE',
      subtitle: `Régime fiscal : ${fiscalRegime} | Attestation non-redevance : ${hasNonRedevance ? 'Valide' : 'Absente'}`,
      entityId: profile.entityId,
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      city: profile.city,
      projectCode: 'BAF-2026-011',
      signatoryTitle: profile.title,
      signatoryName: profile.fullName,
      actorUserId: profile.userId,
      actorRole: profile.roleCode,
      recordTableName: 'decomptes',
      recordId: 'dec-003',
      paragraphs: [
        `Montant brut HT exécuté : ${decompte.grossAmountHt.toLocaleString('fr-FR')} FCFA | Brut TTC (TVA ${(decompte.tvaRate * 100).toFixed(2)}%) : ${decompte.grossAmountTtc.toLocaleString('fr-FR')} FCFA.`,
        `Pénalités de retard nettes (${decompte.penaltyDetails.netDelayDays}j après déduction de ${decompte.penaltyDetails.weatherExcusedDays}j intempéries) : ${decompte.penaltyDetails.cappedPenaltyFcfa.toLocaleString('fr-FR')} FCFA.`,
        `NET A PAYER AU TITULAIRE : ${decompte.netPayableSupplierFcfa.toLocaleString('fr-FR')} FCFA | REVERSEMENT TRESOR PUBLIC : ${decompte.treasuryReversementFcfa.toLocaleString('fr-FR')} FCFA.`,
      ],
      table: {
        title: 'Ventilation Comptable & Fiscale (CGI Cameroun)',
        columns: [
          { header: 'Rubrique', width: 290 },
          { header: 'Montant (FCFA)', width: 205 },
        ],
        rows: [
          ['Montant Brut HT', decompte.grossAmountHt.toLocaleString('fr-FR')],
          ['TVA (19,25%) retenue à la source', decompte.tvaAmountFcfa.toLocaleString('fr-FR')],
          [
            `Précompte IR / AIR (${(decompte.irRate * 100).toFixed(1)}%)`,
            decompte.irAirAmountFcfa.toLocaleString('fr-FR'),
          ],
          [
            `TSR Non-résident (${(decompte.tsrRate * 100).toFixed(1)}%)`,
            decompte.tsrAmountFcfa.toLocaleString('fr-FR'),
          ],
          [
            'Remboursement prorata avance de démarrage',
            decompte.advanceRepaymentFcfa.toLocaleString('fr-FR'),
          ],
          ['Retenue de garantie (10%)', decompte.guaranteeRetentionFcfa.toLocaleString('fr-FR')],
          [
            'Pénalités de retard (plafonnées 10%)',
            decompte.penaltyDetails.cappedPenaltyFcfa.toLocaleString('fr-FR'),
          ],
          ['REVERSEMENT TRESOR PUBLIC', decompte.treasuryReversementFcfa.toLocaleString('fr-FR')],
          ['NET A PAYER AU TITULAIRE', decompte.netPayableSupplierFcfa.toLocaleString('fr-FR')],
        ],
      },
      ampliations: ['Ordonnateur', 'Receveur Municipal / Comptable', 'Titulaire', 'Chrono CF'],
    });
    setPdfResult(pdf);
  };

  const securitiesAlert = useMemo(() => {
    const now = new Date();
    const dayShift = (d: number) =>
      new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
    return evaluateSecuritiesExpiry(
      [
        {
          id: 'fin-sec-1',
          contractOrBidRef: 'ENG-2026-018',
          supplierName: 'ETS KEMGANG BTP SARL',
          securityType: 'CAUTION_BONNE_EXECUTION',
          issuerInstitution: 'Afriland First Bank',
          referenceNumber: 'AFB-CBE-2026-881',
          amountFcfa: 6_200_000,
          expiryDateIso: dayShift(4),
          ohadaFirstDemand: true,
        },
        {
          id: 'fin-sec-2',
          contractOrBidRef: 'LC-2026-011/CB',
          supplierName: 'CAMEROUN SOLAIRE SA',
          securityType: 'ASSURANCE_TRC_RC',
          issuerInstitution: 'AXA Cameroun',
          referenceNumber: 'AXA-TRC-2026-309',
          amountFcfa: 28_000_000,
          expiryDateIso: dayShift(-1),
        },
      ],
      now
    );
  }, []);

  return (
    <div className="space-y-6">
      {securitiesAlert.alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Contrôle Préalable Cautions OHADA &amp; Assurances avant Paiement
            </span>
            <span className="font-semibold">
              {securitiesAlert.expiredCount} expirée(s) · {securitiesAlert.criticalCount} critique(s) (&le;7j)
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-900">
            Montant exposé : {securitiesAlert.totalAtRiskAmountFcfa.toLocaleString('fr-FR')} FCFA — Vérifiez la prorogation des garanties avant apposition du visa financier.
          </p>
        </div>
      )}

      {/* File de Visa Budgétaire Préalable */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
          <Landmark className="h-4 w-4 text-gov-gold" />
          File de Visa Budgétaire Préalable (Contrôleur Financier)
        </h2>
        <div className="mt-4 divide-y divide-slate-100 text-xs">
          {visaQueue.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div className="font-semibold text-gov-navy">
                  {item.reference} — {item.label}
                </div>
                <div className="text-slate-500">
                  Montant : <strong>{item.amountFcfa.toLocaleString('fr-FR')} FCFA</strong> ·
                  Disponible ligne budgétaire :{' '}
                  <strong>{item.budgetAvailableFcfa.toLocaleString('fr-FR')} FCFA</strong>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.status === 'EN_ATTENTE_VISA_CF' ? (
                  <button
                    type="button"
                    onClick={() => grantVisa(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gov-emerald px-3.5 py-1.5 font-semibold text-white hover:brightness-105"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Apposer Visa CF
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {item.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Liquidateur de Décomptes (Fiscalité Camerounaise) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
            <Calculator className="h-4 w-4 text-gov-gold" />
            Liquidation Fiscale des Décomptes (TVA 19,25% · AIR 2,2%/5,5% · TSR 15%)
          </h2>
          <button
            type="button"
            onClick={() => void handlePrintDecomptePdf()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
          >
            <Printer className="h-3.5 w-3.5 text-gov-gold" />
            Éditer Décompte PDF/QR
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
          <div>
            <label className="font-semibold text-slate-600">Type Contrat</label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as ContractType)}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            >
              <option value="MARCHE">MARCHE</option>
              <option value="LETTRE_COMMANDE">LETTRE_COMMANDE</option>
              <option value="BON_COMMANDE_ADMINISTRATIF">BON_COMMANDE_ADMINISTRATIF</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-slate-600">Montant Marché TTC</label>
            <input
              type="number"
              value={contractTtc}
              onChange={(e) => setContractTtc(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">Brut HT Décompte</label>
            <input
              type="number"
              value={grossHt}
              onChange={(e) => setGrossHt(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">Régime Fiscal</label>
            <select
              value={fiscalRegime}
              onChange={(e) => setFiscalRegime(e.target.value as FiscalRegime)}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            >
              <option value="REEL">REEL (2,2%)</option>
              <option value="SIMPLIFIE">SIMPLIFIE (5,5%)</option>
              <option value="LIBERATOIRE">LIBERATOIRE (5,5%)</option>
              <option value="ETRANGER_NON_RESIDENT">ETRANGER_NON_RESIDENT (TSR 15%)</option>
            </select>
          </div>
          <div>
            <label className="font-semibold text-slate-600">Taux Prorata Avance</label>
            <input
              type="number"
              step="0.05"
              value={advanceRate}
              onChange={(e) => setAdvanceRate(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">Jours Retard Bruts</label>
            <input
              type="number"
              value={delayDays}
              onChange={(e) => setDelayDays(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-600">Intempéries Déduites</label>
            <input
              type="number"
              value={weatherDays}
              onChange={(e) => setWeatherDays(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-2.5 py-2"
            />
          </div>
          <div className="flex flex-col justify-center gap-1.5 pt-3">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={hasNonRedevance}
                onChange={(e) => setHasNonRedevance(e.target.checked)}
              />
              Attestation non-redevance valide
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={hasGuaranteeBond}
                onChange={(e) => setHasGuaranteeBond(e.target.checked)}
              />
              Caution remplace retenue 10%
            </label>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Montant Brut TTC</div>
            <div className="mt-1 text-base font-bold text-gov-navy">
              {decompte.grossAmountTtc.toLocaleString('fr-FR')} FCFA
            </div>
            <div className="text-[11px] text-slate-500">
              TVA 19,25% : {decompte.tvaAmountFcfa.toLocaleString('fr-FR')}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Retenues (Avance + 10% + Pén.)</div>
            <div className="mt-1 text-base font-bold text-amber-800">
              {(
                decompte.advanceRepaymentFcfa +
                decompte.guaranteeRetentionFcfa +
                decompte.penaltyDetails.cappedPenaltyFcfa
              ).toLocaleString('fr-FR')}{' '}
              FCFA
            </div>
            <div className="text-[11px] text-slate-500">
              Pénalités ({decompte.penaltyDetails.netDelayDays}j nets) :{' '}
              {decompte.penaltyDetails.cappedPenaltyFcfa.toLocaleString('fr-FR')}
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
            <div className="text-blue-800">Reversement Trésor Public</div>
            <div className="mt-1 text-base font-bold text-blue-950">
              {decompte.treasuryReversementFcfa.toLocaleString('fr-FR')} FCFA
            </div>
            <div className="text-[11px] text-blue-700">
              TVA + {(decompte.irRate * 100).toFixed(1)}% IR /{' '}
              {(decompte.tsrRate * 100).toFixed(0)}% TSR
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
            <div className="text-emerald-800">Net à Payer au Titulaire</div>
            <div className="mt-1 text-base font-bold text-gov-emerald">
              {decompte.netPayableSupplierFcfa.toLocaleString('fr-FR')} FCFA
            </div>
            <div className="text-[11px] text-emerald-700">
              Ref. DE 2% : {decompte.registrationDutyReferenceFcfa.toLocaleString('fr-FR')} FCFA
            </div>
          </div>
        </div>
      </div>

      <PdfPreviewModal result={pdfResult} onClose={() => setPdfResult(null)} />
    </div>
  );
}
