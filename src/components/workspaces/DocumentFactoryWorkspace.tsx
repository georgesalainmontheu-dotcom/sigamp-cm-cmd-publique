'use client';

import {
  BookOpen,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  computeBpuDqeSummary,
  exportBpuToCsv,
  getPresetBpuLines,
  numberToFrenchWordsFcfa,
  parseBpuFromCsv,
  type BpuDqeLineItem,
} from '../../lib/domain/bpuDqeEngine';
import {
  OFFICIAL_DTAO_LIST,
  OFFICIAL_LEGAL_LIBRARY_LIST,
  type OfficialDtaoSlug,
} from '../../lib/domain/officialDtaoEngine';
import {
  PARAMETRIC_ACTS_CATALOG_44,
  renderParametricAct,
  type FundingSourceType,
  type ParametricAdaptationContext,
} from '../../lib/domain/parametricActsEngine';
import { buildAuthenticatedJsonHeaders } from '../../lib/supabase/client';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';
import type {
  ContractType,
  EntityType,
  FiscalRegime,
  ProcurementMode,
  ProcurementNature,
} from '../../types/domain';

type FactoryTab = 'ACTS_44' | 'DTAO_DC' | 'LEGAL_LIBRARY';

function triggerBase64Download(base64: string, fileName: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function DocumentFactoryWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [tab, setTab] = useState<FactoryTab>('ACTS_44');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedActCode, setSelectedActCode] = useState<string>(
    PARAMETRIC_ACTS_CATALOG_44[0]!.actCode
  );
  const [archiveInGed, setArchiveInGed] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Contexte paramétrique partagé (6 axes d'adaptation)
  const [entityType, setEntityType] = useState<EntityType>('COMMUNE');
  const [parentTutelleName, setParentTutelleName] = useState('Préfecture du Haut-Nkam');
  const [hasOwnCipm, setHasOwnCipm] = useState(false);
  const [city, setCity] = useState('Bafang');
  const [chronoNumber, setChronoNumber] = useState('042/C-BAF/SG/SIGAMP/2026');
  const [projectCode, setProjectCode] = useState('BAF-2026-011');
  const [projectTitle, setProjectTitle] = useState(
    'Travaux de réhabilitation et pavage de la voirie urbaine du Marché Central de Bafang'
  );
  const [nature, setNature] = useState<ProcurementNature>('TRAVAUX');
  const [procurementMode, setProcurementMode] = useState<ProcurementMode>('DC_COTATION');
  const [contractType, setContractType] = useState<ContractType>('LETTRE_COMMANDE');
  const [fundingSource, setFundingSource] = useState<FundingSourceType>('BUDGET_COMMUNAL');
  const [fiscalRegime, setFiscalRegime] = useState<FiscalRegime>('REEL');
  const [isUrgency, setIsUrgency] = useState(false);
  const [isMultiLot, setIsMultiLot] = useState(false);
  const [amountTtcFcfa, setAmountTtcFcfa] = useState(48_500_000);
  const [executionDays, setExecutionDays] = useState(90);
  const [supplierName, setSupplierName] = useState('ETS BATI-KAM SUARL');
  const [supplierNiu, setSupplierNiu] = useState('M041912345678X');
  const [customClause, setCustomClause] = useState('');

  // Paramètres DTAO / Demande de Cotation (DC)
  const [dtaoSlug, setDtaoSlug] = useState<OfficialDtaoSlug>('dt_demande_cotation');
  const [budgetImputation, setBudgetImputation] = useState('60-2210-01-4402');
  const [daoPriceFcfa, setDaoPriceFcfa] = useState(50_000);
  const [submissionDeadline, setSubmissionDeadline] = useState('15/12/2026 à 12h00');
  const [openingDatetime, setOpeningDatetime] = useState('15/12/2026 à 13h00');

  // Bibliothèque juridique officielle
  const [legalSlug, setLegalSlug] = useState<string>('decret_2018_366');
  const [legalQuery, setLegalQuery] = useState<string>('');
  const [legalResults, setLegalResults] = useState<
    Array<{ page: number; text: string }>
  >([]);
  const [legalTotalMatches, setLegalTotalMatches] = useState<number>(0);

  // Éditeur Structuré BPU / DQE (V3.1)
  const [bpuItems, setBpuItems] = useState<BpuDqeLineItem[]>(() => getPresetBpuLines('TRAVAUX'));
  const [blankBidderTables, setBlankBidderTables] = useState(false);

  // Hydratation Gabarit Studio & Clauses CMS de l'entité
  const [studioLayoutBadge, setStudioLayoutBadge] = useState<{
    headerLayout: string;
    cmsTemplatesCount: number;
    hasLogo: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const headers = await buildAuthenticatedJsonHeaders();
        const res = await fetch(
          `/api/admin/entity-studio?entityId=${encodeURIComponent(profile.entityId)}`,
          { headers }
        );
        if (!res.ok || !active) return;
        const json = (await res.json()) as {
          entities?: Array<{
            id: string;
            logo_url?: string | null;
            studio_config?: { identityExtra?: { headerLayout?: string } };
            local_referentials?: { actTemplates?: Array<{ enabled?: boolean }> };
          }>;
        };
        const matched =
          json.entities?.find((e) => e.id === profile.entityId) ?? json.entities?.[0];
        if (matched && active) {
          const layout =
            matched.studio_config?.identityExtra?.headerLayout === 'CENTERED'
              ? 'Centré'
              : 'Bilingue FR/EN';
          const tplCount = Array.isArray(matched.local_referentials?.actTemplates)
            ? matched.local_referentials.actTemplates.filter((t) => t.enabled !== false).length
            : 0;
          setStudioLayoutBadge({
            headerLayout: layout,
            cmsTemplatesCount: tplCount,
            hasLogo: Boolean(matched.logo_url),
          });
        }
      } catch {
        // Fallback silencieux
      }
    })();
    return () => {
      active = false;
    };
  }, [profile.entityId]);

  const bpuSummary = useMemo(
    () => computeBpuDqeSummary(bpuItems, { fiscalRegime }),
    [bpuItems, fiscalRegime]
  );

  const filteredActs = useMemo(() => {
    if (roleFilter === 'ALL') return PARAMETRIC_ACTS_CATALOG_44;
    return PARAMETRIC_ACTS_CATALOG_44.filter((a) => a.roleGroupLabel === roleFilter);
  }, [roleFilter]);

  const roleGroups = useMemo(
    () => Array.from(new Set(PARAMETRIC_ACTS_CATALOG_44.map((a) => a.roleGroupLabel))),
    []
  );

  const actContext: ParametricAdaptationContext = useMemo(
    () => ({
      entityName: profile.entityName,
      entityCode: profile.entityCode,
      entityType,
      parentTutelleName,
      hasOwnCipm,
      city,
      fiscalYear: profile.fiscalYear,
      chronoNumber,
      dateFormatted: new Date().toLocaleDateString('fr-FR'),
      signerTitle:
        entityType === 'PREFECTURE'
          ? 'Le Préfet du Département / MOD'
          : entityType === 'GOUVERNORAT'
            ? 'Le Gouverneur de Région / MOD'
            : 'Le Maire / Autorité Contractante',
      signerName: profile.fullName,
      recipientLabel: '',
      projectCode,
      projectTitle,
      nature,
      procurementMode,
      contractType,
      fundingSource,
      fiscalRegime,
      isUrgency,
      isMultiLot,
      amountTtcFcfa,
      executionDays,
      supplierName,
      supplierNiu,
      customAdaptableClause: customClause || undefined,
    }),
    [
      profile,
      entityType,
      parentTutelleName,
      hasOwnCipm,
      city,
      chronoNumber,
      projectCode,
      projectTitle,
      nature,
      procurementMode,
      contractType,
      fundingSource,
      fiscalRegime,
      isUrgency,
      isMultiLot,
      amountTtcFcfa,
      executionDays,
      supplierName,
      supplierNiu,
      customClause,
    ]
  );

  const renderedPreview = useMemo(
    () => renderParametricAct(selectedActCode, actContext),
    [selectedActCode, actContext]
  );

  const handleExportAct = async (format: 'pdf' | 'docx') => {
    setExporting(true);
    setFeedback(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'PARAMETRIC_ACT',
          format,
          actCode: selectedActCode,
          entityId: profile.entityId,
          archiveInGed,
          primaryColorHex: profile.primaryColor,
          accentColorHex: profile.accentColor,
          context: actContext,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        fileName?: string;
        mimeType?: string;
        base64?: string;
        sha256?: string;
        qrVerificationId?: string;
      };
      if (!res.ok || !json.base64 || !json.fileName || !json.mimeType) {
        setFeedback(`Erreur export : ${json.error ?? 'Réponse incomplète'}`);
        return;
      }
      triggerBase64Download(json.base64, json.fileName, json.mimeType);
      setFeedback(
        `${json.fileName} généré (${format.toUpperCase()}) · SHA-256 : ${json.sha256?.slice(0, 16)}...${
          archiveInGed ? ' · Archivé automatiquement en GED !' : ''
        }`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur export.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportDtaoOrDc = async (format: 'pdf' | 'docx') => {
    setExporting(true);
    setFeedback(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'OFFICIAL_DTAO_OR_DC',
          format,
          entityId: profile.entityId,
          archiveInGed,
          primaryColorHex: profile.primaryColor,
          accentColorHex: profile.accentColor,
          dtaoInput: {
            slug: dtaoSlug,
            entityName: profile.entityName,
            entityType,
            parentTutelleName,
            hasOwnCipm,
            city,
            fiscalYear: profile.fiscalYear,
            consultationNumber: chronoNumber,
            signatureDateFormatted: new Date().toLocaleDateString('fr-FR'),
            projectTitle,
            nature,
            fundingSource,
            budgetImputation,
            estimatedAmountTtc: amountTtcFcfa,
            executionDays,
            submissionDeadlineFormatted: submissionDeadline,
            openingDatetimeFormatted: openingDatetime,
            daoPurchasePriceFcfa: daoPriceFcfa,
            fiscalRegime,
            isUrgency,
            bpuItems,
            blankBidderTables,
          },
        }),
      });

      const json = (await res.json()) as {
        error?: string;
        fileName?: string;
        mimeType?: string;
        base64?: string;
        sha256?: string;
        sourceOfficialPages?: number;
        generatedPages?: number;
      };
      if (!res.ok || !json.base64 || !json.fileName || !json.mimeType) {
        setFeedback(`Erreur génération DTAO/DC : ${json.error ?? 'Réponse incomplète'}`);
        return;
      }
      triggerBase64Download(json.base64, json.fileName, json.mimeType);
      setFeedback(
        `Dossier intégral ${json.fileName} (${json.sourceOfficialPages ?? '?'} pages officielles adaptées -> ${json.generatedPages ?? 'DOCX'} pages exportées) · SHA-256 : ${json.sha256?.slice(0, 16)}...`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur export DTAO/DC.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportBpuStandalone = async (format: 'pdf' | 'docx') => {
    setExporting(true);
    setFeedback(null);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'BPU_DQE_STANDALONE',
          format,
          entityId: profile.entityId,
          archiveInGed,
          primaryColorHex: profile.primaryColor,
          accentColorHex: profile.accentColor,
          entityName: profile.entityName,
          entityCode: profile.entityCode,
          city,
          consultationNumber: chronoNumber,
          projectTitle,
          fiscalRegime,
          blankForBidder: blankBidderTables,
          items: bpuItems,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        fileName?: string;
        mimeType?: string;
        base64?: string;
        sha256?: string;
      };
      if (!res.ok || !json.base64 || !json.fileName || !json.mimeType) {
        setFeedback(`Erreur export BPU/DQE : ${json.error ?? 'Réponse incomplète'}`);
        return;
      }
      triggerBase64Download(json.base64, json.fileName, json.mimeType);
      setFeedback(
        `Extrait BPU + DQE ${json.fileName} généré (${format.toUpperCase()}) · SHA-256 : ${json.sha256?.slice(0, 16)}...`
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur export BPU/DQE.');
    } finally {
      setExporting(false);
    }
  };

  const handleSearchLegalLibrary = async () => {
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch(
        `/api/official-library?slug=${encodeURIComponent(legalSlug)}&q=${encodeURIComponent(
          legalQuery
        )}&limit=8`,
        { headers }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          matchesCount: number;
          pages: Array<{ page: number; text: string }>;
        };
        setLegalResults(json.pages ?? []);
        setLegalTotalMatches(json.matchesCount ?? 0);
      }
    } catch {
      setLegalResults([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête Usine Documentaire */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gov-gold" />
            <h2 className="text-lg font-bold text-gov-navy">
              Usine Documentaire V3.0 : 44 Actes, DTAO Intégral & Demande de Cotation (DC)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Production fidèle aux modèles officiels ARMP/MINMAP (1 141 pages officielles indexées) avec
            export <strong>PDF scellé</strong> & <strong>Word (.docx) modifiable</strong>.
          </p>
          {studioLayoutBadge && (
            <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-900">
              <span>
                Gabarit Studio injecté : <strong>En-tête {studioLayoutBadge.headerLayout}</strong>
              </span>
              <span>· {studioLayoutBadge.hasLogo ? 'Logo entité actif' : 'Sans logo image'}</span>
              <span>· {studioLayoutBadge.cmsTemplatesCount} modèle(s) CMS liés</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('ACTS_44')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === 'ACTS_44' ? 'bg-gov-navy text-white' : 'text-slate-700'
            }`}
          >
            44 Actes Paramétriques
          </button>
          <button
            type="button"
            onClick={() => setTab('DTAO_DC')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === 'DTAO_DC' ? 'bg-gov-navy text-white' : 'text-slate-700'
            }`}
          >
            DTAO Intégral & Demande de Cotation (DC)
          </button>
          <button
            type="button"
            onClick={() => setTab('LEGAL_LIBRARY')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tab === 'LEGAL_LIBRARY' ? 'bg-gov-navy text-white' : 'text-slate-700'
            }`}
          >
            Lois & Recueil ARMP (1 141p)
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Paramètres Contextuels 6 Axes (communs Acts 44 & DTAO/DC) */}
      {tab !== 'LEGAL_LIBRARY' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gov-navy">
              Paramètres Contextuels du Dossier (6 Axes Réglementaires)
            </h3>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={archiveInGed}
                onChange={(e) => setArchiveInGed(e.target.checked)}
                className="rounded border-slate-300"
              />
              Archiver automatiquement dans la GED Régalienne après génération
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Type d’Entité / Tutelle
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="COMMUNE">Commune (CTD)</option>
                <option value="PREFECTURE">Préfecture (CDPM / MOD)</option>
                <option value="GOUVERNORAT">Gouvernorat (CRPM / MOD)</option>
                <option value="COMMUNAUTE_URBAINE">Communauté Urbaine (CIPM)</option>
                <option value="REGION">Conseil Régional (CRPM)</option>
                <option value="MINISTERE">Ministère (CIPM)</option>
                <option value="EPA">Établissement Public (EPA)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Commission Compétente
              </label>
              <select
                value={hasOwnCipm ? 'CIPM' : 'CDPM'}
                onChange={(e) => setHasOwnCipm(e.target.value === 'CIPM')}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="CDPM">CDPM (Tutelle Préfectorale / Sans CIPM)</option>
                <option value="CIPM">CIPM propre (ou CRPM)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Source de Financement
              </label>
              <select
                value={fundingSource}
                onChange={(e) => setFundingSource(e.target.value as FundingSourceType)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="BUDGET_COMMUNAL">Budget Communal / CTD</option>
                <option value="BIP_ETAT">BIP État (Ministère / MOD)</option>
                <option value="FEICOM">FEICOM / Coopération</option>
                <option value="FONDS_ROUTIER">Fonds Routier</option>
                <option value="BAILLEUR_EXTERNE">Bailleur Extérieur (PTF)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Régime Fiscal (CGI)
              </label>
              <select
                value={fiscalRegime}
                onChange={(e) => setFiscalRegime(e.target.value as FiscalRegime)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              >
                <option value="REEL">Régime du Réel (AIR 2,2 %)</option>
                <option value="SIMPLIFIE">Régime Simplifié (AIR 5,5 %)</option>
                <option value="LIBERATOIRE">Impôt Libératoire</option>
                <option value="ETRANGER_NON_RESIDENT">Étranger Non-Résident (TSR 15 %)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                N° Chrono / Consultation
              </label>
              <input
                value={chronoNumber}
                onChange={(e) => setChronoNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Référence Marché
              </label>
              <input
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Montant TTC (FCFA)
              </label>
              <input
                type="number"
                value={amountTtcFcfa}
                onChange={(e) => setAmountTtcFcfa(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Délai d’exécution (jours)
              </label>
              <input
                type="number"
                value={executionDays}
                onChange={(e) => setExecutionDays(Number(e.target.value) || 30)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                Objet du Projet / Marché / Demande de Cotation
              </label>
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Entreprise / Attributaire
              </label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-end gap-3 pb-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isUrgency}
                  onChange={(e) => setIsUrgency(e.target.checked)}
                />
                Urgence Art. 87(2)
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isMultiLot}
                  onChange={(e) => setIsMultiLot(e.target.checked)}
                />
                Alloti
              </label>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 1 : 44 ACTES PARAMETRIQUES */}
      {tab === 'ACTS_44' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <label className="block text-[11px] font-bold uppercase text-slate-500">
                Filtrer par Rôle RBAC ({filteredActs.length} actes)
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium"
              >
                <option value="ALL">Tous les rôles (44 Actes réglementaires)</option>
                {roleGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <div className="mt-3 max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                {filteredActs.map((act) => {
                  const active = act.actCode === selectedActCode;
                  return (
                    <button
                      key={act.actCode}
                      type="button"
                      onClick={() => setSelectedActCode(act.actCode)}
                      className={`w-full rounded-xl border p-2.5 text-left transition ${
                        active
                          ? 'border-gov-navy bg-gov-navy text-white'
                          : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{act.title}</div>
                      <div
                        className={`mt-0.5 text-[10px] ${
                          active ? 'text-gov-gold' : 'text-slate-500'
                        }`}
                      >
                        {act.roleOwner} · {act.legalBasis}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-gov-navy">{renderedPreview.act.title}</h4>
                  <p className="text-[11px] text-slate-500">
                    {renderedPreview.commissionCompetente} · {renderedPreview.fiscalNote}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleExportAct('pdf')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gov-navy px-3 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5 text-gov-gold" />
                    Exporter PDF Scellé
                  </button>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleExportAct('docx')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gov-navy px-3 py-2 text-xs font-semibold text-gov-navy hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Word (.docx)
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <div className="font-bold">Clause Réglementaire Verrouillée (Ordre Public) :</div>
                  <p className="mt-1">{renderedPreview.lockedSection}</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600">
                    Corps Adaptable (personnalisable avant export PDF/DOCX)
                  </label>
                  <textarea
                    rows={4}
                    value={customClause || renderedPreview.adaptableSection}
                    onChange={(e) => setCustomClause(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-sans text-xs"
                  />
                </div>

                <div className="rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                  {renderedPreview.fullDocumentText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 2 : DTAO INTEGRAL & DEMANDE DE COTATION (DC) */}
      {tab === 'DTAO_DC' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {OFFICIAL_DTAO_LIST.map((item) => {
              const selected = item.slug === dtaoSlug;
              return (
                <div
                  key={item.slug}
                  onClick={() => setDtaoSlug(item.slug as OfficialDtaoSlug)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    selected
                      ? 'border-gov-navy bg-gov-navy text-white shadow-md'
                      : 'border-slate-200 bg-white text-slate-900 hover:border-gov-navy/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        selected ? 'bg-gov-gold text-gov-navy' : 'bg-slate-100 text-gov-navy'
                      }`}
                    >
                      {item.kind}
                    </span>
                    <span className="text-[11px] font-semibold opacity-80">
                      {item.totalPages} pages officielles
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-bold">{item.title}</h4>
                  <p
                    className={`mt-1.5 text-xs ${
                      selected ? 'text-slate-200' : 'text-slate-600'
                    }`}
                  >
                    {item.description}
                  </p>
                  <div className="mt-3">
                    <a
                      href={item.pdfPath}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold underline ${
                        selected ? 'text-gov-gold' : 'text-gov-navy'
                      }`}
                    >
                      <FileText className="h-3 w-3" />
                      Ouvrir PDF Officiel Vierge ARMP
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* EDITEUR STRUCTURE BPU / DQE (PIECES IV & V ARMP) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-gov-gold" />
                  <h3 className="text-sm font-bold text-gov-navy">
                    Éditeur Structuré BPU / DQE (Pièces IV &amp; V — Demande de Cotation &amp; DTAO)
                  </h3>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Conversion automatique en toutes lettres (ARMP) + calcul HT / TVA 19,25 % / TTC / AIR / Net à mandater.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setNature('TRAVAUX');
                    setBpuItems(getPresetBpuLines('TRAVAUX'));
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Modèle Travaux
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNature('FOURNITURES');
                    setBpuItems(getPresetBpuLines('FOURNITURES'));
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Modèle Fournitures
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNature('SERVICES_QUANTIFIABLES');
                    setBpuItems(getPresetBpuLines('SERVICES_QUANTIFIABLES'));
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Modèle Services
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const csv = exportBpuToCsv(bpuItems);
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `BPU_DQE_${projectCode}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-gov-navy hover:bg-slate-50"
                >
                  <Download className="h-3 w-3" />
                  Export CSV
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-gov-navy hover:bg-slate-50">
                  <Upload className="h-3 w-3" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const txt = await f.text();
                      const parsed = parseBpuFromCsv(txt);
                      if (parsed.length > 0) {
                        setBpuItems(parsed);
                        setFeedback(`${parsed.length} lignes importées dans le BPU/DQE.`);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-gov-navy">
                    <th className="p-2 w-20">N° Prix</th>
                    <th className="p-2">Désignation &amp; P.U. en toutes lettres</th>
                    <th className="p-2 w-20">Unité</th>
                    <th className="p-2 w-28">P.U. HT (F)</th>
                    <th className="p-2 w-24">Quantité</th>
                    <th className="p-2 w-32 text-right">Montant HT (F)</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bpuItems.map((item, idx) => {
                    const lineTotal = Math.round((item.unitPriceHt || 0) * (item.quantity || 0));
                    return (
                      <tr key={item.id} className="align-top">
                        <td className="p-1.5">
                          <input
                            value={item.priceNumber}
                            onChange={(e) =>
                              setBpuItems((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, priceNumber: e.target.value } : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            value={item.designation}
                            onChange={(e) =>
                              setBpuItems((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, designation: e.target.value } : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                          />
                          <div className="mt-0.5 text-[10px] italic text-slate-500">
                            En lettres : {numberToFrenchWordsFcfa(item.unitPriceHt)}
                          </div>
                        </td>
                        <td className="p-1.5">
                          <select
                            value={item.unit}
                            onChange={(e) =>
                              setBpuItems((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-xs"
                          >
                            {['U', 'Fft', 'Ens', 'm²', 'm³', 'ml', 'kg', 'T', 'J/H', 'Mois'].map(
                              (u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              )
                            )}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            value={item.unitPriceHt}
                            onChange={(e) =>
                              setBpuItems((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, unitPriceHt: Number(e.target.value) || 0 }
                                    : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              setBpuItems((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, quantity: Number(e.target.value) || 0 }
                                    : r
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-slate-900">
                          {lineTotal.toLocaleString('fr-FR')}
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setBpuItems((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            title="Supprimer cette ligne"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setBpuItems((prev) => [
                      ...prev,
                      {
                        id: `line-${Date.now()}`,
                        priceNumber: String(100 + prev.length + 1),
                        designation: 'Nouvelle prestation / fourniture',
                        unit: 'U',
                        unitPriceHt: 10_000,
                        quantity: 1,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-gov-navy px-3 py-1.5 text-xs font-semibold text-gov-navy hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une ligne de prix
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAmountTtcFcfa(bpuSummary.totalTtc);
                    setFeedback(
                      `Montant estimé du marché synchronisé avec le DQE : ${bpuSummary.totalTtc.toLocaleString('fr-FR')} FCFA TTC.`
                    );
                  }}
                  className="rounded-xl bg-gov-gold/20 px-3 py-1.5 text-xs font-semibold text-gov-navy hover:bg-gov-gold/30"
                >
                  Appliquer {bpuSummary.totalTtc.toLocaleString('fr-FR')} F TTC au projet
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={blankBidderTables}
                    onChange={(e) => setBlankBidderTables(e.target.checked)}
                  />
                  Tableaux vierges (à remplir par soumissionnaire)
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportBpuStandalone('pdf')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-gov-navy hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Extrait BPU + DQE (.pdf)
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportBpuStandalone('docx')}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-gov-navy hover:bg-slate-50"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Extrait BPU + DQE (.docx)
                </button>
              </div>
            </div>

            {/* Récapitulatif financier CGI temps réel */}
            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-5">
              <div>
                <div className="text-[10px] font-semibold text-slate-500">TOTAL HT</div>
                <div className="font-mono font-bold text-slate-900">
                  {bpuSummary.totalHt.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">
                  TVA ({(bpuSummary.tvaRate * 100).toFixed(2)} %)
                </div>
                <div className="font-mono font-bold text-slate-900">
                  {bpuSummary.tvaAmount.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">TOTAL TTC</div>
                <div className="font-mono font-bold text-gov-navy">
                  {bpuSummary.totalTtc.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">
                  AIR ({(bpuSummary.airRate * 100).toFixed(1)} %)
                </div>
                <div className="font-mono font-bold text-amber-800">
                  -{bpuSummary.airAmount.toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500">NET À MANDATER</div>
                <div className="font-mono font-bold text-emerald-800">
                  {bpuSummary.netToOrder.toLocaleString('fr-FR')} F
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gov-navy">
              Paramètres Spécifiques d’Adaptation Intégrale ({dtaoSlug})
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Imputation Budgétaire
                </label>
                <input
                  value={budgetImputation}
                  onChange={(e) => setBudgetImputation(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Frais d’achat du DAO (FCFA)
                </label>
                <input
                  type="number"
                  value={daoPriceFcfa}
                  onChange={(e) => setDaoPriceFcfa(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Date limite dépôt des plis
                </label>
                <input
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">
                  Date & heure d’ouverture
                </label>
                <input
                  value={openingDatetime}
                  onChange={(e) => setOpeningDatetime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-600">
                Préserve <strong>100 % des pages officielles ARMP</strong> (RGAO, RPDC, CCAP, BPU,
                DQE, Lettre-Commande, Formulaires, Banques COBAC) tout en injectant le contexte et
                les taux fiscaux en vigueur.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportDtaoOrDc('pdf')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-gov-gold" />
                  {exporting ? 'Assemblage intégral...' : 'Générer Dossier Intégral (.pdf)'}
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void handleExportDtaoOrDc('docx')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gov-navy px-4 py-2 text-xs font-semibold text-gov-navy hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Générer Word Modifiable (.docx)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 3 : BIBLIOTHEQUE JURIDIQUE OFFICIELLE */}
      {tab === 'LEGAL_LIBRARY' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {OFFICIAL_LEGAL_LIBRARY_LIST.map((doc) => (
              <div
                key={doc.slug}
                onClick={() => setLegalSlug(doc.slug)}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  legalSlug === doc.slug
                    ? 'border-gov-navy bg-gov-navy text-white'
                    : 'border-slate-200 bg-white text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                    <Scale className="h-4 w-4 text-gov-gold" />
                    {doc.kind}
                  </span>
                  <span className="text-[11px]">{doc.totalPages} pages</span>
                </div>
                <h4 className="mt-1.5 text-sm font-bold">{doc.title}</h4>
                <p
                  className={`mt-1 text-xs ${
                    legalSlug === doc.slug ? 'text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {doc.description}
                </p>
                <a
                  href={doc.pdfPath}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold underline ${
                    legalSlug === doc.slug ? 'text-gov-gold' : 'text-gov-navy'
                  }`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger PDF Officiel Complet
                </a>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={legalQuery}
                  onChange={(e) => setLegalQuery(e.target.value)}
                  placeholder="Ex: Préfet, CDPM, Demande de cotation, avenant 30%, caution, Art. 92..."
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSearchLegalLibrary()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
              >
                <BookOpen className="h-4 w-4 text-gov-gold" />
                Rechercher dans le texte officiel
              </button>
            </div>

            {legalResults.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="text-xs font-semibold text-slate-600">
                  {legalTotalMatches} page(s) correspondante(s) (affichage des {legalResults.length} premières) :
                </div>
                {legalResults.map((p) => (
                  <div
                    key={p.page}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="font-bold text-gov-navy">Page officielle {p.page}</div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-slate-700">
                      {p.text.slice(0, 1200)}
                      {p.text.length > 1200 ? '...' : ''}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
