'use client';

import {
  AlertTriangle,
  CheckSquare,
  Cloud,
  Eye,
  Lock,
  Printer,
  Save,
  ShieldAlert,
  Unlock,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { detectAbnormalLowBids } from '../../lib/domain/billingEngine';
import {
  calculateIndemnityLiquidation,
  type SessionAttendanceRecord,
} from '../../lib/domain/indemnityEngine';
import { useWorkspacePersistence } from '../../lib/hooks/useWorkspacePersistence';
import {
  generateOfficialPdf,
  type GeneratedOfficialPdfResult,
} from '../../lib/pdf/pdfGenerator';
import {
  DEFAULT_DEMO_SCALES,
  type ActiveRoleProfile,
} from '../../lib/ui/demoProfiles';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';

interface BidEvalRow {
  bidId: string;
  supplierName: string;
  adminCompliant: boolean;
  techScore: number;
  financialTtc: number;
}

export function CommissionScaWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  // 1. Salle virtuelle d'ouverture & feuille de présence émargée
  const [attendances, setAttendances] = useState<SessionAttendanceRecord[]>([
    {
      attendanceId: 's-1',
      userId: 'u-pres',
      fullName: 'Dr. Mireille Nguemo',
      roleCode: 'CPM_PRESIDENT',
      isPresent: true,
    },
    {
      attendanceId: 's-2',
      userId: 'u-sec',
      fullName: 'Jean-Paul Kamdem',
      roleCode: 'CPM_SECRETAIRE',
      isPresent: true,
    },
    {
      attendanceId: 's-3',
      userId: 'u-m1',
      fullName: 'Ing. Brice Tchamba',
      roleCode: 'CPM_MEMBRE',
      isPresent: true,
    },
    {
      attendanceId: 's-4',
      userId: 'u-m2',
      fullName: 'Mme Solange Mbarga',
      roleCode: 'CPM_MEMBRE',
      isPresent: false,
    },
    {
      attendanceId: 's-5',
      userId: 'u-armp',
      fullName: 'Observateur Indépendant ARMP',
      roleCode: 'ARMP_OBSERVATEUR',
      isPresent: true,
      distanceKm: 35,
    },
  ]);

  // 2. Grille SCA isolée par phase (ADMIN -> TECH -> FIN)
  const [techValidated, setTechValidated] = useState(false);
  const [ownerEstimateTtc] = useState(120_000_000);
  const [bids, setBids] = useState<BidEvalRow[]>([
    {
      bidId: 'bid-1',
      supplierName: 'ETS KEMGANG BTP SARL',
      adminCompliant: true,
      techScore: 86,
      financialTtc: 112_500_000,
    },
    {
      bidId: 'bid-2',
      supplierName: 'SOCOBA CAMEROUN SA',
      adminCompliant: true,
      techScore: 81,
      financialTtc: 118_900_000,
    },
    {
      bidId: 'bid-3',
      supplierName: 'LOWCOST INFRA SARL',
      adminCompliant: true,
      techScore: 74,
      financialTtc: 82_000_000, // OAB suspectée (< 85% référence pondérée)
    },
    {
      bidId: 'bid-4',
      supplierName: 'BATI-OUEST SARL',
      adminCompliant: false,
      techScore: 0,
      financialTtc: 109_000_000,
    },
  ]);

  const [pdfResult, setPdfResult] = useState<GeneratedOfficialPdfResult | null>(null);

  const { loadedState, syncBadge, isSaving, persistState } = useWorkspacePersistence<{
    attendances: SessionAttendanceRecord[];
    techValidated: boolean;
    bids: BidEvalRow[];
  }>(profile.entityId, 'CPM_SCA');

  useEffect(() => {
    if (!loadedState) return;
    if (Array.isArray(loadedState.attendances)) setAttendances(loadedState.attendances);
    if (typeof loadedState.techValidated === 'boolean') {
      setTechValidated(loadedState.techValidated);
    }
    if (Array.isArray(loadedState.bids)) setBids(loadedState.bids);
  }, [loadedState]);

  const saveCpmState = (
    nextAttendances = attendances,
    nextTechValidated = techValidated,
    nextBids = bids
  ) => {
    void persistState(
      {
        attendances: nextAttendances,
        techValidated: nextTechValidated,
        bids: nextBids,
      },
      'SAVE_CPM_SCA_SESSION'
    );
  };

  const togglePresence = (attendanceId: string) => {
    const next = attendances.map((a) =>
      a.attendanceId === attendanceId ? { ...a, isPresent: !a.isPresent } : a
    );
    setAttendances(next);
    saveCpmState(next, techValidated, bids);
  };

  const sessionIndemnity = useMemo(
    () =>
      calculateIndemnityLiquidation({
        entityId: profile.entityId,
        fiscalYear: profile.fiscalYear,
        triggerEvent: 'OUVERTURE_PLIS',
        commissionType: 'CDPM',
        procurementMode: 'AONO',
        contractAmountTtc: ownerEstimateTtc,
        lotsCount: 1,
        bidsCount: bids.length,
        scales: DEFAULT_DEMO_SCALES,
        attendances,
        budgetLine: {
          budgetLineId: 'bl-cdpm-2026',
          chapitre: '62',
          article: '6210',
          initialAllocationFcfa: 5_000_000,
          committedFcfa: 800_000,
        },
      }),
    [attendances, bids.length, ownerEstimateTtc, profile]
  );

  const oabReport = useMemo(() => {
    const qualified = bids.filter((b) => b.adminCompliant && b.techScore >= 70);
    if (qualified.length === 0) return null;
    return detectAbnormalLowBids({
      ownerEstimateTtc,
      bids: qualified.map((q) => ({
        bidId: q.bidId,
        supplierName: q.supplierName,
        amountTtc: q.financialTtc,
      })),
    });
  }, [bids, ownerEstimateTtc]);

  const handlePrintPvOpening = async () => {
    const pdf = await generateOfficialPdf({
      documentType: 'PV_OUVERTURE',
      documentNumber: 'PV-CDPM-2026-011',
      title: "PROCES-VERBAL D'OUVERTURE DES PLIS & FEUILLE DE PRESENCE EMARGEE",
      subtitle: 'DAO n° 005/AONO/CB/CDPM/2026 — Construction du marché communal',
      entityId: profile.entityId,
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      city: profile.city,
      projectCode: 'BAF-2026-011',
      signatoryTitle: profile.title,
      signatoryName: profile.fullName,
      actorUserId: profile.userId,
      actorRole: profile.roleCode,
      recordTableName: 'tender_files',
      recordId: 'tf-005',
      paragraphs: [
        `Membres présents émargés : ${sessionIndemnity.items.length} | Absents exclus de liquidation : ${sessionIndemnity.excludedActors.length}.`,
        `Indemnités de séance pré-liquidées : ${sessionIndemnity.totalGrossFcfa.toLocaleString('fr-FR')} FCFA brut.`,
        oabReport && oabReport.flaggedCount > 0
          ? `Alerte OAB : ${oabReport.flaggedCount} offre(s) suspectée(s) anormalement basse(s) sous le seuil de ${oabReport.oabThresholdAmountTtc.toLocaleString('fr-FR')} FCFA TTC.`
          : 'Aucune OAB détectée à ce stade.',
      ],
      table: {
        title: 'Registre des Plis Ouverts',
        columns: [
          { header: 'Soumissionnaire', width: 185 },
          { header: 'Dossier Admin', width: 90 },
          { header: 'Note Tech', width: 80 },
          { header: 'Offre TTC (FCFA)', width: 145 },
        ],
        rows: bids.map((b) => [
          b.supplierName,
          b.adminCompliant ? 'CONFORME' : 'ELIMINE',
          `${b.techScore}/100`,
          techValidated ? b.financialTtc.toLocaleString('fr-FR') : 'ISOLE (NON OUVERT)',
        ]),
      },
      ampliations: ['Maître d’Ouvrage', 'ARMP', 'SIGAMP', 'Chrono CDPM'],
    });
    setPdfResult(pdf);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-gov-navy">
          <Cloud className="h-4 w-4 text-emerald-600" />
          Persistance Serveur Commission (CPM / SCA) :{' '}
          <span className="font-normal text-slate-600">
            {syncBadge ?? 'Synchronisation prête'}
          </span>
        </span>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => saveCpmState()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gov-navy px-3 py-1.5 font-semibold text-white hover:bg-gov-navyLight disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5 text-gov-gold" />
          {isSaving ? 'Sauvegarde...' : 'Sauvegarder Supabase'}
        </button>
      </div>

      {/* Salle virtuelle d'ouverture & Feuille de présence émargée */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Users className="h-4 w-4 text-gov-gold" />
              Feuille de Présence Émargée (Séance CDPM)
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              Liée au Moteur d&apos;Indemnités
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Cochez/décochez la présence réelle : tout membre absent est instantanément exclu du calcul
            indemnitaire.
          </p>

          <div className="mt-4 divide-y divide-slate-100 text-xs">
            {attendances.map((a) => (
              <div key={a.attendanceId} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="font-semibold text-slate-800">{a.fullName}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.roleCode}
                    {a.distanceKm ? ` · Déplacement ${a.distanceKm} km` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => togglePresence(a.attendanceId)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition ${
                    a.isPresent
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {a.isPresent ? 'Présent émargé' : 'Absent (Exclu)'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div className="flex justify-between font-bold text-gov-navy">
              <span>Total Brut Indemnités Séance :</span>
              <span>{sessionIndemnity.totalGrossFcfa.toLocaleString('fr-FR')} FCFA</span>
            </div>
            <div className="mt-1 flex justify-between text-slate-600">
              <span>
                Bénéficiaires liquidés : {sessionIndemnity.items.length} · Exclus :{' '}
                {sessionIndemnity.excludedActors.length}
              </span>
              <span>Net : {sessionIndemnity.totalNetFcfa.toLocaleString('fr-FR')} FCFA</span>
            </div>
          </div>
        </div>

        {/* Grille SCA isolée & Détection OAB */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Eye className="h-4 w-4 text-gov-gold" />
              Grille SCA Isolée (Admin &rarr; Tech &rarr; Fin) &amp; Détection OAB
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !techValidated;
                  setTechValidated(next);
                  saveCpmState(attendances, next, bids);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  techValidated
                    ? 'bg-gov-emerald text-white'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {techValidated ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {techValidated ? 'Phase FIN Déverrouillée' : 'Valider Tech pour ouvrir FIN'}
              </button>
              <button
                type="button"
                onClick={() => void handlePrintPvOpening()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gov-navy px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Printer className="h-3.5 w-3.5 text-gov-gold" />
                PV PDF/QR
              </button>
            </div>
          </div>

          {/* Vue Mobile (< 640px) : Cartes empilées */}
          <div className="mt-4 space-y-3 sm:hidden">
            {bids.map((b) => {
              const oabInfo = oabReport?.analyses.find((x) => x.bidId === b.bidId);
              return (
                <div
                  key={b.bidId}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gov-navy">{b.supplierName}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        b.adminCompliant
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {b.adminCompliant ? 'CONFORME' : 'ÉLIMINÉ'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-slate-600">Note Technique :</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={!b.adminCompliant}
                      value={b.techScore}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBids((prev) =>
                          prev.map((row) =>
                            row.bidId === b.bidId ? { ...row, techScore: val } : row
                          )
                        );
                      }}
                      className="w-20 rounded border px-2 py-1 text-right disabled:bg-slate-100"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                    <span className="font-mono text-slate-800">
                      {techValidated
                        ? `${b.financialTtc.toLocaleString('fr-FR')} FCFA`
                        : 'Enveloppe isolée (RLS)'}
                    </span>
                    {techValidated && oabInfo?.isOabSuspected && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        <ShieldAlert className="h-3 w-3" />
                        OAB ({oabInfo.deviationPct}%)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vue Desktop (>= 640px) */}
          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2">Soumissionnaire</th>
                  <th className="py-2">Admin</th>
                  <th className="py-2">Note Tech</th>
                  <th className="py-2">Offre Financière TTC</th>
                  <th className="py-2">OAB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bids.map((b) => {
                  const oabInfo = oabReport?.analyses.find((x) => x.bidId === b.bidId);
                  return (
                    <tr key={b.bidId}>
                      <td className="py-2.5 font-medium">{b.supplierName}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            b.adminCompliant
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {b.adminCompliant ? 'CONFORME' : 'ÉLIMINÉ'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          disabled={!b.adminCompliant}
                          value={b.techScore}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBids((prev) =>
                              prev.map((row) =>
                                row.bidId === b.bidId ? { ...row, techScore: val } : row
                              )
                            );
                          }}
                          className="w-16 rounded border px-2 py-1 disabled:bg-slate-100"
                        />
                      </td>
                      <td className="py-2.5 font-mono">
                        {techValidated ? (
                          `${b.financialTtc.toLocaleString('fr-FR')} FCFA`
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Lock className="h-3 w-3" /> Enveloppe isolée (RLS)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {techValidated && oabInfo?.isOabSuspected ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            <ShieldAlert className="h-3 w-3" />
                            OAB ({oabInfo.deviationPct}%)
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {techValidated && oabReport && oabReport.flaggedCount > 0 && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4" />
                Détection OAB Active (Seuil pondéré :{' '}
                {oabReport.oabThresholdAmountTtc.toLocaleString('fr-FR')} FCFA TTC)
              </div>
              <p className="mt-1">
                Exiger par écrit des sous-détails de prix justifiant l&apos;offre anormalement basse
                avant toute proposition d&apos;attribution en CPM.
              </p>
            </div>
          )}
        </div>
      </div>

      <PdfPreviewModal result={pdfResult} onClose={() => setPdfResult(null)} />
    </div>
  );
}
