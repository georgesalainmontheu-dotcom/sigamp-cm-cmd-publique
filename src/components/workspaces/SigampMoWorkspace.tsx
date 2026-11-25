'use client';

import {
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  FileSignature,
  FileText,
  FolderPlus,
  Layers,
  Mail,
  Printer,
  Scale,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { calculateAdjustedCompletionDate } from '../../lib/domain/billingEngine';
import {
  evaluateAmendment,
  evaluateMiseEnDemeure,
  evaluateSecuritiesExpiry,
  type SecurityRecordInput,
} from '../../lib/domain/exceptionsEngine';
import {
  calculateIndemnityLiquidation,
  type SessionAttendanceRecord,
} from '../../lib/domain/indemnityEngine';
import {
  calculateLegalTimeline,
  evaluateAddendumExtension,
  routeProcurementProcedure,
} from '../../lib/domain/procurementRouter';
import { generateAdministrativeCorrespondence } from '../../lib/ai/correspondenceGenerator';
import {
  generateProvisionalChronoId,
  getOfflineDb,
  saveOfflineRecord,
  saveOfflineRecordWithProvisionalChrono,
} from '../../lib/offline/offlineStore';
import {
  generateOfficialPdf,
  type GeneratedOfficialPdfResult,
} from '../../lib/pdf/pdfGenerator';
import {
  DEFAULT_DEMO_SCALES,
  type ActiveRoleProfile,
} from '../../lib/ui/demoProfiles';
import type { CorrespondenceCaseType } from '../../types/ai';
import type { ProcurementNature } from '../../types/domain';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';
import { ValueChainWorkspace } from './ValueChainWorkspace';

interface ProjectItem {
  id: string;
  code: string;
  title: string;
  nature: ProcurementNature;
  amountTtc: number;
  mode: string;
  contractType: string;
  commission: string;
  status: string;
}

export function SigampMoWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [activeTab, setActiveTab] = useState<
    'VALUE_CHAIN' | 'PROJECTS' | 'DAO_TIMELINE' | 'AVENANTS_MED' | 'CORRESPONDENCE' | 'INDEMNITIES'
  >('VALUE_CHAIN');

  // 1. Journal & Création Projet
  const [projects, setProjects] = useState<ProjectItem[]>([
    {
      id: 'proj-001',
      code: 'BAF-2026-011',
      title: 'Construction du marché communal de Bafang (Lot 1)',
      nature: 'TRAVAUX',
      amountTtc: 120_000_000,
      mode: 'AONO',
      contractType: 'MARCHE',
      commission: 'CDPM',
      status: 'LANCE_AAO',
    },
    {
      id: 'proj-002',
      code: 'BAF-2026-014',
      title: 'Acquisition de matériel informatique et serveur SIGAMP',
      nature: 'FOURNITURES',
      amountTtc: 24_500_000,
      mode: 'DC_COTATION',
      contractType: 'LETTRE_COMMANDE',
      commission: 'CDPM',
      status: 'EN_EVALUATION_SCA',
    },
  ]);

  const [newCode, setNewCode] = useState('BAF-2026-021');
  const [newTitle, setNewTitle] = useState('Réhabilitation route communale Bafang - Banka');
  const [newNature, setNewNature] = useState<ProcurementNature>('TRAVAUX');
  const [newAmount, setNewAmount] = useState(65_000_000);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  // 2. DAO & Rétroplanning + Additif
  const [pubDateIso, setPubDateIso] = useState('2026-11-24');
  const [addendumDateIso, setAddendumDateIso] = useState('2026-12-16');
  const [addendumSubstantial, setAddendumSubstantial] = useState(false);

  // 3. Avenant 30% & Mise en demeure 15-21j
  const [initialHt, setInitialHt] = useState(100_000_000);
  const [prevAmendmentsHt, setPrevAmendmentsHt] = useState(18_000_000);
  const [proposedAmendmentHt, setProposedAmendmentHt] = useState(15_000_000);
  const [medNotifiedIso, setMedNotifiedIso] = useState('2026-11-01');
  const [medDays, setMedDays] = useState(18);
  const [medRemedied, setMedRemedied] = useState(false);

  // 4. Correspondances
  const [caseType, setCaseType] = useState<CorrespondenceCaseType>('BORDEREAU_TRANSMISSION');
  const [chrono, setChrono] = useState('045/BT/CB/SIGAMP/2026');
  const [recipient, setRecipient] = useState('Monsieur le Président de la CDPM du Haut-Nkam');
  const [generatedDocText, setGeneratedDocText] = useState<string>('');

  // 5. Indemnités & PDF modal
  const [pdfResult, setPdfResult] = useState<GeneratedOfficialPdfResult | null>(null);

  const liveRouting = useMemo(() => {
    try {
      return routeProcurementProcedure({
        entityType: profile.entityType,
        nature: newNature,
        estimatedAmountTtc: Math.max(1, newAmount),
      });
    } catch {
      return null;
    }
  }, [profile.entityType, newNature, newAmount]);

  const timelineInfo = useMemo(() => {
    const pub = new Date(`${pubDateIso}T09:00:00Z`);
    if (Number.isNaN(pub.getTime())) return null;
    const tl = calculateLegalTimeline({
      publicationDate: pub,
      mode: liveRouting?.recommendedMode ?? 'AONO',
    });
    const addDate = new Date(`${addendumDateIso}T09:00:00Z`);
    let addendum = null;
    if (!Number.isNaN(addDate.getTime()) && addDate <= tl.minSubmissionDeadline) {
      addendum = evaluateAddendumExtension({
        currentSubmissionDeadline: tl.minSubmissionDeadline,
        addendumIssuedAt: addDate,
        modifiesSubstantially: addendumSubstantial,
      });
    }
    return { tl, addendum };
  }, [pubDateIso, addendumDateIso, addendumSubstantial, liveRouting]);

  const amendmentEval = useMemo(
    () =>
      evaluateAmendment({
        initialContractAmountHt: Math.max(1, initialHt),
        previousApprovedAmendmentsDeltaHt: prevAmendmentsHt,
        proposedAmendmentDeltaHt: proposedAmendmentHt,
        hasCpmOrCccmOpinion: true,
        cpmOrCccmOpinionRef: 'AVIS-CDPM-2026-12',
        hasBudgetaryCommitment: true,
      }),
    [initialHt, prevAmendmentsHt, proposedAmendmentHt]
  );

  const medStatus = useMemo(() => {
    try {
      return evaluateMiseEnDemeure({
        notifiedAt: new Date(`${medNotifiedIso}T09:00:00Z`),
        gracePeriodDays: medDays,
        evaluationDate: new Date(),
        remediedBySupplier: medRemedied,
      });
    } catch {
      return null;
    }
  }, [medNotifiedIso, medDays, medRemedied]);

  const demoIndemnityState = useMemo(() => {
    const attendances: SessionAttendanceRecord[] = [
      {
        attendanceId: 'att-p',
        userId: 'u-pres',
        fullName: 'Dr. Mireille Nguemo',
        roleCode: 'CPM_PRESIDENT',
        isPresent: true,
      },
      {
        attendanceId: 'att-m1',
        userId: 'u-m1',
        fullName: 'Ing. Paul Ndongo',
        roleCode: 'CPM_MEMBRE',
        isPresent: true,
      },
      {
        attendanceId: 'att-armp',
        userId: 'u-armp',
        fullName: 'Observateur ARMP',
        roleCode: 'ARMP_OBSERVATEUR',
        isPresent: true,
        distanceKm: 40,
      },
      {
        attendanceId: 'att-abs',
        userId: 'u-abs',
        fullName: 'Membre Absent Excusé',
        roleCode: 'CPM_MEMBRE',
        isPresent: false,
      },
    ];
    return calculateIndemnityLiquidation({
      entityId: profile.entityId,
      fiscalYear: profile.fiscalYear,
      triggerEvent: 'OUVERTURE_PLIS',
      commissionType: 'CDPM',
      procurementMode: 'AONO',
      contractAmountTtc: 120_000_000,
      lotsCount: 2,
      bidsCount: 5,
      scales: DEFAULT_DEMO_SCALES,
      attendances,
      budgetLine: {
        budgetLineId: 'bl-ind-2026',
        chapitre: '62',
        article: '6210',
        initialAllocationFcfa: 6_500_000,
        committedFcfa: 1_200_000,
      },
    });
  }, [profile]);

  const securitiesReport = useMemo(() => {
    const today = new Date();
    const addDays = (d: number) =>
      new Date(today.getTime() + d * 86_400_000).toISOString().slice(0, 10);
    const demoSecurities: SecurityRecordInput[] = [
      {
        id: 'sec-1',
        contractOrBidRef: 'M-2026-004/CB',
        supplierName: 'ETS KEMGANG BTP SARL',
        securityType: 'CAUTION_BONNE_EXECUTION',
        issuerInstitution: 'Afriland First Bank',
        referenceNumber: 'AFB-CBE-2026-881',
        amountFcfa: 6_200_000,
        expiryDateIso: addDays(5),
        ohadaFirstDemand: true,
      },
      {
        id: 'sec-2',
        contractOrBidRef: 'LC-2026-011/CB',
        supplierName: 'CAMEROUN SOLAIRE SA',
        securityType: 'ASSURANCE_TRC_RC',
        issuerInstitution: 'AXA Cameroun',
        referenceNumber: 'AXA-TRC-2026-309',
        amountFcfa: 28_000_000,
        expiryDateIso: addDays(-2),
      },
      {
        id: 'sec-3',
        contractOrBidRef: 'M-2026-009/CB',
        supplierName: 'SOCOBA CAMEROUN SA',
        securityType: 'CAUTION_AVANCE_DEMARRAGE',
        issuerInstitution: 'BICEC',
        referenceNumber: 'BICEC-CAD-2026-112',
        amountFcfa: 18_500_000,
        expiryDateIso: addDays(21),
        ohadaFirstDemand: true,
      },
    ];
    return evaluateSecuritiesExpiry(demoSecurities, today);
  }, []);

  const adjustedOsTimeline = useMemo(
    () =>
      calculateAdjustedCompletionDate({
        startOrderDateIso: '2026-06-01',
        initialDurationDays: 120,
        amendmentDurationDeltaDays: 15,
        serviceOrders: [
          { osNumber: 'OS-ARR-01', osType: 'ARRET', effectiveDateIso: '2026-07-10' },
          { osNumber: 'OS-REP-01', osType: 'REPRISE', effectiveDateIso: '2026-07-25' },
          {
            osNumber: 'OS-TECH-02',
            osType: 'TECHNIQUE',
            effectiveDateIso: '2026-08-15',
            weatherExcusedDays: 7,
          },
        ],
        evaluationDateIso: new Date().toISOString().slice(0, 10),
      }),
    []
  );

  const handleCreateProjectOffline = async () => {
    if (!liveRouting) return;
    const effectiveCode =
      newCode.trim() || generateProvisionalChronoId('PROV');
    const newUuid =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `44444444-4444-4444-8444-${String(Date.now()).slice(-12).padStart(12, '0')}`;
    const item: ProjectItem = {
      id: newUuid,
      code: effectiveCode,
      title: newTitle,
      nature: newNature,
      amountTtc: newAmount,
      mode: liveRouting.recommendedMode,
      contractType: liveRouting.contractType,
      commission: liveRouting.primaryCommission ?? 'DIRECT',
      status: 'BROUILLON_LOCAL',
    };
    setProjects((prev) => [item, ...prev]);
    try {
      const db = getOfflineDb();
      await saveOfflineRecordWithProvisionalChrono(
        db,
        'projects',
        {
          id: item.id,
          entity_id: profile.entityId,
          fiscal_year: profile.fiscalYear,
          reference_code: newCode.trim() || undefined,
          title: item.title,
          nature: item.nature,
          mode: item.mode,
          estimated_amount_ht: Math.round(item.amountTtc / 1.1925),
          estimated_amount_ttc: item.amountTtc,
          status: 'MATURATION',
        },
        {
          chronoField: 'reference_code',
          docType: 'PROJ',
          chronoPrefix: profile.entityCode,
          fiscalYear: profile.fiscalYear,
        }
      );
      setOfflineNotice(
        `Projet ${item.code} enregistré dans Dexie (Local-First) et prêt pour allocation atomique à la synchronisation.`
      );
    } catch {
      setOfflineNotice(`Projet ${item.code} ajouté à la vue de session.`);
    }
  };

  const handleGenerateCorrespondence = async () => {
    const res = await generateAdministrativeCorrespondence({
      entityId: profile.entityId,
      caseType,
      header: {
        entityName: profile.entityName,
        entityType: profile.entityType,
        serviceLine: 'Service Interne de Gestion Administrative des Marchés Publics (SIGAMP)',
        city: profile.city,
        chronoNumber: chrono,
        dateFormatted: new Date().toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }),
        senderRole: profile.roleCode,
        senderTitle: profile.title,
        senderName: profile.fullName,
        recipientLabel: recipient,
        recipientRank: 'Destinataire Officiel',
        hierarchyDirection: 'EGALITAIRE',
      },
      sqlContext: {
        projectCode: projects[0]?.code ?? 'BAF-2026-011',
        projectTitle: projects[0]?.title ?? 'Travaux communaux',
        fiscalYear: profile.fiscalYear,
        amountTtcFcfa: projects[0]?.amountTtc ?? 120_000_000,
        procurementMode: 'AONO',
        commissionType: 'CDPM',
        gracePeriodDays: medDays,
      },
    });
    setGeneratedDocText(res.fullFormattedDocument);
  };

  const handleExportPdf = async (
    docType: 'DAO' | 'ORDRE_SERVICE' | 'CORRESPONDANCE' | 'ETAT_INDEMNITES'
  ) => {
    const isIndemnity = docType === 'ETAT_INDEMNITES';
    const pdf = await generateOfficialPdf({
      documentType: docType,
      documentNumber: isIndemnity ? `LIQ-IND-${profile.fiscalYear}-004` : chrono,
      title: isIndemnity
        ? 'ETAT LIQUIDATIF DES INDEMNITES DE SESSION (CDPM)'
        : docType === 'DAO'
          ? `DOSSIER D'APPEL D'OFFRES — ${projects[0]?.code ?? 'BAF-2026-011'}`
          : `${caseType} — ${chrono}`,
      subtitle: projects[0]?.title,
      entityId: profile.entityId,
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      city: profile.city,
      projectCode: projects[0]?.code,
      signatoryTitle: profile.title,
      signatoryName: profile.fullName,
      actorUserId: profile.userId,
      actorRole: profile.roleCode,
      recordTableName: isIndemnity ? 'indemnity_liquidations' : 'generated_correspondences',
      recordId: `rec-${Date.now()}`,
      paragraphs: isIndemnity
        ? [
            `Acte générateur : ${demoIndemnityState.triggerEvent} | Dossier : ${projects[0]?.code ?? 'BAF-2026-011'}.`,
            `Total Brut : ${demoIndemnityState.totalGrossFcfa.toLocaleString('fr-FR')} FCFA | Retenues fiscales : ${demoIndemnityState.totalWithholdingFcfa.toLocaleString('fr-FR')} FCFA | Net à payer : ${demoIndemnityState.totalNetFcfa.toLocaleString('fr-FR')} FCFA.`,
            `Acteurs exclus pour absence sur feuille de présence : ${demoIndemnityState.excludedActors.length}.`,
          ]
        : [
            generatedDocText ||
              `Document officiel généré pour l'opération ${projects[0]?.title ?? 'BAF-2026-011'} (${projects[0]?.amountTtc.toLocaleString('fr-FR')} FCFA TTC).`,
          ],
      table: isIndemnity
        ? {
            title: 'Détail des Bénéficiaires Émargés',
            columns: [
              { header: 'Bénéficiaire', width: 170 },
              { header: 'Rôle', width: 110 },
              { header: 'Brut (FCFA)', width: 85 },
              { header: 'IR (FCFA)', width: 70 },
              { header: 'Net (FCFA)', width: 70 },
            ],
            rows: demoIndemnityState.items.map((it) => [
              it.beneficiaryName,
              it.roleCode,
              it.grossAmountFcfa.toLocaleString('fr-FR'),
              it.withholdingFcfa.toLocaleString('fr-FR'),
              it.netAmountFcfa.toLocaleString('fr-FR'),
            ]),
          }
        : undefined,
      ampliations: ['MINMAP', 'ARMP', 'Contrôleur Financier', 'Chrono / Archives'],
    });
    try {
      const db = getOfflineDb();
      await saveOfflineRecord(db, 'audit_logs', {
        id: pdf.qrVerificationId,
        ...pdf.auditLogEntry,
      });
    } catch {
      // ignore in SSR
    }
    setPdfResult(pdf);
  };

  return (
    <div className="space-y-6">
      {/* Bandeau d'alerte Cautions OHADA & Assurances */}
      {securitiesReport.alerts.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs text-rose-950 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-rose-900">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Surveillance Cautions OHADA &amp; Assurances ({securitiesReport.alerts.length} alerte(s))
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {securitiesReport.expiredCount > 0 && (
                <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-white">
                  {securitiesReport.expiredCount} expirée(s)
                </span>
              )}
              {securitiesReport.criticalCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-slate-950">
                  {securitiesReport.criticalCount} critique(s) &le; 7j
                </span>
              )}
              {securitiesReport.warningCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900">
                  {securitiesReport.warningCount} à surveiller (8-30j)
                </span>
              )}
            </div>
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            {securitiesReport.alerts.map((al) => (
              <div
                key={al.securityId}
                className="rounded-xl border border-rose-200/80 bg-white/80 p-2.5"
              >
                <div className="flex items-center justify-between gap-1 font-semibold text-gov-navy">
                  <span>{al.contractOrBidRef}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      al.severity === 'EXPIRED'
                        ? 'bg-rose-100 text-rose-800'
                        : al.severity === 'CRITICAL'
                          ? 'bg-amber-200 text-amber-950'
                          : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {al.daysRemaining < 0 ? `Expirée (${al.daysRemaining}j)` : `J-${al.daysRemaining}`}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600">
                  {al.supplierName} · {al.issuerInstitution}
                </div>
                <div className="mt-1 font-mono text-[11px] font-semibold text-slate-800">
                  {al.amountFcfa.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation interne SIGAMP / MO */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'VALUE_CHAIN', label: 'Chaîne de Valeur Intégrale (7 Étapes)', icon: Layers },
          { id: 'PROJECTS', label: 'Journal des Projets & Routage CMP', icon: FolderPlus },
          { id: 'DAO_TIMELINE', label: 'Montage DAO & Délais / Additifs', icon: CalendarClock },
          { id: 'AVENANTS_MED', label: 'Avenants (30%) & Mise en Demeure', icon: AlertOctagon },
          { id: 'CORRESPONDENCE', label: 'Correspondances & Actes', icon: Mail },
          { id: 'INDEMNITIES', label: 'Liquidation Indemnités', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-guide-tag={`sigamp-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-gov-navy text-white shadow'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-gov-navy'
              }`}
            >
              <Icon className="h-4 w-4 text-gov-gold" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {offlineNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
          {offlineNotice}
        </div>
      )}

      {/* TAB 0 : CHAÎNE DE VALEUR INTÉGRALE V2.0 */}
      {activeTab === 'VALUE_CHAIN' && <ValueChainWorkspace profile={profile} />}

      {/* TAB 1 : PROJETS & ROUTAGE CMP */}
      {activeTab === 'PROJECTS' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <FolderPlus className="h-4 w-4 text-gov-gold" />
              Nouveau Projet (Routage CMP Instantané)
            </h2>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600">Code Projet</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-600">Intitulé</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-600">Nature CMP</label>
                  <select
                    value={newNature}
                    onChange={(e) => setNewNature(e.target.value as ProcurementNature)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"
                  >
                    <option value="TRAVAUX">TRAVAUX</option>
                    <option value="FOURNITURES">FOURNITURES</option>
                    <option value="SERVICES_QUANTIFIABLES">SERVICES_QUANTIFIABLES</option>
                    <option value="PRESTATIONS_INTELLECTUELLES">PRESTATIONS_INTELLECTUELLES</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-600">Montant TTC (FCFA)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"
                  />
                </div>
              </div>

              {liveRouting && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                  <div className="font-bold text-gov-navy">
                    Routage : {liveRouting.contractType} · {liveRouting.recommendedMode}
                  </div>
                  <div className="text-slate-600">
                    Commission : <strong>{liveRouting.primaryCommission ?? 'Aucune (< 5M)'}</strong>
                    {liveRouting.requiresCccmPriorOpinion && (
                      <span className="ml-1 font-semibold text-amber-700">
                        + Avis conforme {liveRouting.cccmOrgan}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500">
                    Publicité min. : {liveRouting.minPublicityDays}j · Tutelle CTD :{' '}
                    {liveRouting.requiresTutelleLegalityControl ? 'OUI (Loi 2019/024)' : 'NON'}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleCreateProjectOffline()}
                className="w-full rounded-xl bg-gov-navy py-2.5 text-xs font-semibold text-white hover:bg-gov-navyLight"
              >
                Enregistrer Local-First (Dexie + File Sync)
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gov-navy">
                Journal des Projets de l&apos;Entité ({projects.length})
              </h2>
              <button
                type="button"
                onClick={() => void handleExportPdf('DAO')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gov-navy px-3 py-1.5 text-xs font-semibold text-gov-navy hover:bg-gov-navy hover:text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                Générer DAO PDF/QR
              </button>
            </div>
            {/* Vue Mobile (< 640px) : Cartes empilées */}
            <div className="mt-4 space-y-3 sm:hidden">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-gov-navy">{p.code}</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium text-slate-800">{p.title}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2">
                    <span className="rounded bg-white px-2 py-0.5 font-medium text-slate-700">
                      {p.contractType} ({p.mode})
                    </span>
                    <span className="font-bold text-gov-navy">
                      {p.amountTtc.toLocaleString('fr-FR')} FCFA
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Vue Desktop (>= 640px) */}
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Opération</th>
                    <th className="py-2 pr-3">Type / Mode</th>
                    <th className="py-2 pr-3">Montant TTC</th>
                    <th className="py-2">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projects.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-3 font-mono font-semibold text-gov-navy">{p.code}</td>
                      <td className="py-3 pr-3">{p.title}</td>
                      <td className="py-3 pr-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">
                          {p.contractType} ({p.mode})
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-semibold">
                        {p.amountTtc.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td className="py-3">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2 : DAO & RETROPLANNING */}
      {activeTab === 'DAO_TIMELINE' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
            <CalendarClock className="h-4 w-4 text-gov-gold" />
            Rétroplanning Légal CMP & Contrôle Automatique des Additifs (&lt; 7 jours)
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
            <div>
              <label className="font-semibold text-slate-600">Date Publication AAO</label>
              <input
                type="date"
                value={pubDateIso}
                onChange={(e) => setPubDateIso(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-600">Simulation Date Additif</label>
              <input
                type="date"
                value={addendumDateIso}
                onChange={(e) => setAddendumDateIso(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <label className="mt-5 flex items-center gap-2 font-medium text-slate-700">
              <input
                type="checkbox"
                checked={addendumSubstantial}
                onChange={(e) => setAddendumSubstantial(e.target.checked)}
              />
              Additif modifiant substantiellement le DAO
            </label>
          </div>

          {timelineInfo && (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4 text-xs">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                <div className="text-slate-500">Dépôt / Ouverture min.</div>
                <div className="mt-1 text-sm font-bold text-gov-navy">
                  {timelineInfo.tl.openingDate.toISOString().slice(0, 10)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                <div className="text-slate-500">Validité des offres (90j)</div>
                <div className="mt-1 text-sm font-bold text-gov-navy">
                  {timelineInfo.tl.offerValidityEndDate.toISOString().slice(0, 10)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                <div className="text-slate-500">Fin Standstill (5j ouvrables CM)</div>
                <div className="mt-1 text-sm font-bold text-gov-emerald">
                  {timelineInfo.tl.standstillEndDate.toISOString().slice(0, 10)}
                </div>
              </div>
              <div
                className={`rounded-xl p-3.5 border ${
                  timelineInfo.addendum?.extensionRequired
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                }`}
              >
                <div className="font-semibold">Contrôle Additif</div>
                <div className="mt-1">
                  {timelineInfo.addendum
                    ? timelineInfo.addendum.extensionRequired
                      ? `Prorogation +${timelineInfo.addendum.addedDays}j -> ${timelineInfo.addendum.newOpeningDate.toISOString().slice(0, 10)}`
                      : 'Pas de report requis (>= 7 jours)'
                    : 'Date additif hors plage'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3 : AVENANTS 30% & MISE EN DEMEURE */}
      {activeTab === 'AVENANTS_MED' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 text-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Scale className="h-4 w-4 text-gov-gold" />
              Verrou Légal des Avenants (Plafond Cumulé 30%)
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-slate-600">Marché initial HT</label>
                <input
                  type="number"
                  value={initialHt}
                  onChange={(e) => setInitialHt(Number(e.target.value))}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-600">Avenants antérieurs</label>
                <input
                  type="number"
                  value={prevAmendmentsHt}
                  onChange={(e) => setPrevAmendmentsHt(Number(e.target.value))}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-600">Nouvel avenant HT</label>
                <input
                  type="number"
                  value={proposedAmendmentHt}
                  onChange={(e) => setProposedAmendmentHt(Number(e.target.value))}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </div>
            </div>
            <div
              className={`rounded-xl border p-3.5 ${
                amendmentEval.exceeds30PercentCap
                  ? 'border-rose-300 bg-rose-50 text-rose-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <div className="font-bold">
                Cumul : {amendmentEval.cumulativePercentage}% — Circuit :{' '}
                {amendmentEval.requiredWorkflowRoute}
              </div>
              {amendmentEval.blockingReasons.map((r) => (
                <div key={r} className="mt-1">
                  • {r}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 text-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <AlertOctagon className="h-4 w-4 text-gov-crimson" />
              Chronomètre Mise en Demeure (15 à 21 jours)
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-slate-600">Date notification OS</label>
                <input
                  type="date"
                  value={medNotifiedIso}
                  onChange={(e) => setMedNotifiedIso(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-600">Délai (15–21j)</label>
                <input
                  type="number"
                  min={15}
                  max={21}
                  value={medDays}
                  onChange={(e) => setMedDays(Number(e.target.value))}
                  className="mt-1 w-full rounded border px-2 py-1.5"
                />
              </div>
              <label className="mt-5 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={medRemedied}
                  onChange={(e) => setMedRemedied(e.target.checked)}
                />
                Régularisé
              </label>
            </div>
            {medStatus && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1">
                <div>
                  Échéance : <strong>{medStatus.deadlineDate.toISOString().slice(0, 10)}</strong> ·
                  Jours restants : <strong>{medStatus.daysRemaining}</strong>
                </div>
                <div className="font-semibold text-gov-navy">
                  Éligible résiliation aux torts exclusifs + saisine ARMP :{' '}
                  {medStatus.eligibleForFaultTermination ? 'OUI' : 'NON'}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-gov-navy">
                <AlertTriangle className="h-3.5 w-3.5 text-blue-700" />
                Ajustement Délai Contractuel par OS (ARRET / REPRISE / Intempéries)
              </div>
              <div className="text-slate-700">
                Fin initiale : <strong>{adjustedOsTimeline.initialCompletionDateIso}</strong> &rarr;{' '}
                Fin révisée : <strong>{adjustedOsTimeline.revisedCompletionDateIso}</strong>
              </div>
              <div className="text-[11px] text-slate-600">
                Avenants : +{adjustedOsTimeline.amendmentDurationDeltaDays}j · Suspensions ARRET/REPRISE :{' '}
                +{adjustedOsTimeline.suspendedDays}j · Intempéries : +{adjustedOsTimeline.weatherExcusedDays}j ·
                Retard réel exigible : <strong>{adjustedOsTimeline.actualDelayDays}j</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4 : CORRESPONDANCES & PDF */}
      {activeTab === 'CORRESPONDENCE' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <FileSignature className="h-4 w-4 text-gov-gold" />
              Générateur de Correspondances Administratives Camerounaises
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleGenerateCorrespondence()}
                className="rounded-lg bg-gov-navy px-4 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight"
              >
                Générer Brouillon SQL
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf('CORRESPONDANCE')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gov-gold px-4 py-2 text-xs font-semibold text-gov-navy"
              >
                <FileText className="h-3.5 w-3.5" />
                Sceller PDF + QR Code
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
            <select
              value={caseType}
              onChange={(e) => setCaseType(e.target.value as CorrespondenceCaseType)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="BORDEREAU_TRANSMISSION">Bordereau de Transmission</option>
              <option value="NOTE_INFORMATION">Note d&apos;Information</option>
              <option value="ORDRE_SERVICE">Ordre de Service</option>
              <option value="MISE_EN_DEMEURE">Mise en Demeure (15–21j)</option>
              <option value="NOTIFICATION_ATTRIBUTION">Notification d&apos;Attribution</option>
            </select>
            <input
              value={chrono}
              onChange={(e) => setChrono(e.target.value)}
              placeholder="N° Chrono"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Destinataire"
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          {generatedDocText && (
            <textarea
              value={generatedDocText}
              onChange={(e) => setGeneratedDocText(e.target.value)}
              rows={13}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 p-4 font-mono text-xs text-slate-800"
            />
          )}
        </div>
      )}

      {/* TAB 5 : INDEMNITES */}
      {activeTab === 'INDEMNITIES' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-gov-navy">
                État Liquidatif Automatique des Indemnités (Croisement Émargement)
              </h2>
              <p className="text-xs text-slate-500">
                Acte : {demoIndemnityState.triggerEvent} · Budget disponible :{' '}
                {demoIndemnityState.budgetAvailableBeforeFcfa.toLocaleString('fr-FR')} FCFA · Visa CF
                éligible :{' '}
                <strong>{demoIndemnityState.canSubmitForVisaCf ? 'OUI' : 'NON'}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleExportPdf('ETAT_INDEMNITES')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
            >
              <Printer className="h-3.5 w-3.5 text-gov-gold" />
              Imprimer État PDF/QR
            </button>
          </div>

          {/* Vue Mobile (< 640px) : Cartes empilées */}
          <div className="space-y-3 sm:hidden">
            {demoIndemnityState.items.map((it) => (
              <div
                key={it.attendanceId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gov-navy">{it.beneficiaryName}</span>
                  <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {it.roleCode}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-[11px]">
                  <div>
                    <span className="block text-slate-500">Brut</span>
                    <strong>{it.grossAmountFcfa.toLocaleString('fr-FR')}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-500">IR</span>
                    <strong>{it.withholdingFcfa.toLocaleString('fr-FR')}</strong>
                  </div>
                  <div>
                    <span className="block text-slate-500">Net</span>
                    <strong className="text-gov-emerald">
                      {it.netAmountFcfa.toLocaleString('fr-FR')}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Vue Desktop (>= 640px) */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2">Bénéficiaire</th>
                  <th className="py-2">Rôle</th>
                  <th className="py-2">Brut</th>
                  <th className="py-2">Retenue IR</th>
                  <th className="py-2">Net à Payer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demoIndemnityState.items.map((it) => (
                  <tr key={it.attendanceId}>
                    <td className="py-2.5 font-medium">{it.beneficiaryName}</td>
                    <td className="py-2.5">{it.roleCode}</td>
                    <td className="py-2.5">{it.grossAmountFcfa.toLocaleString('fr-FR')} FCFA</td>
                    <td className="py-2.5">{it.withholdingFcfa.toLocaleString('fr-FR')} FCFA</td>
                    <td className="py-2.5 font-bold text-gov-emerald">
                      {it.netAmountFcfa.toLocaleString('fr-FR')} FCFA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {demoIndemnityState.excludedActors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Acteurs exclus automatiquement :</strong>{' '}
              {demoIndemnityState.excludedActors
                .map((e) => `${e.fullName} (${e.reason})`)
                .join(' ; ')}
            </div>
          )}
        </div>
      )}

      <PdfPreviewModal result={pdfResult} onClose={() => setPdfResult(null)} />
    </div>
  );
}
