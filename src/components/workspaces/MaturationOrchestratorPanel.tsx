'use client';

import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  GitMerge,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildMaturationProcedurePlan,
  computeDeliverablesMetrics,
  updateDeliverableStatus,
  type DeliverableStatus,
  type FundingCategory,
  type MaturationProcedureInput,
  type ProcedureDeliverableItem,
  type ProcedureUrgencyMode,
} from '../../lib/domain/maturationWorkflowEngine';
import type { EntityType, ProcurementNature } from '../../types/domain';

interface MaturationOrchestratorPanelProps {
  entityId: string;
  entityType: EntityType;
  projectCode: string;
  projectTitle: string;
  nature: ProcurementNature;
  estimatedAmountTtc: number;
}

const STATUS_BADGE: Record<DeliverableStatus, string> = {
  A_PRODUIRE: 'border-slate-300 bg-slate-100 text-slate-700',
  EN_REDACTION: 'border-sky-300 bg-sky-50 text-sky-800',
  SOUMIS_CONTROLE: 'border-amber-300 bg-amber-50 text-amber-800',
  VISA_OBTENU: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  SIGNE_ARCHIVE_GED: 'border-emerald-500 bg-emerald-600 text-white',
  REJETE_A_CORRIGER: 'border-rose-300 bg-rose-50 text-rose-800',
};

export function MaturationOrchestratorPanel({
  entityId,
  entityType,
  projectCode,
  projectTitle,
  nature,
  estimatedAmountTtc,
}: MaturationOrchestratorPanelProps) {
  const [fundingCategory, setFundingCategory] = useState<FundingCategory>('FEICOM');
  const [urgencyMode, setUrgencyMode] = useState<ProcedureUrgencyMode>('NORMALE');
  const [requiresLandSite, setRequiresLandSite] = useState<boolean>(true);
  const [requiresEnvironmentalNotice, setRequiresEnvironmentalNotice] =
    useState<boolean>(false);
  const [allotted, setAllotted] = useState<boolean>(false);
  const [phaseFilter, setPhaseFilter] = useState<number>(0); // 0 = Toutes

  const procInput: MaturationProcedureInput = useMemo(
    () => ({
      projectCode,
      projectTitle,
      entityType,
      nature,
      estimatedAmountTtc,
      fundingCategory,
      urgencyMode,
      requiresLandSite,
      requiresEnvironmentalNotice,
      allotted,
    }),
    [
      projectCode,
      projectTitle,
      entityType,
      nature,
      estimatedAmountTtc,
      fundingCategory,
      urgencyMode,
      requiresLandSite,
      requiresEnvironmentalNotice,
      allotted,
    ]
  );

  const roadmap = useMemo(() => buildMaturationProcedurePlan(procInput), [procInput]);

  const storageKey = `sigamp_deliverables_${entityId}_${projectCode}`;
  const [deliverables, setDeliverables] = useState<ProcedureDeliverableItem[]>(
    roadmap.deliverables
  );

  // Hydrate saved deliverable statuses if matching roadmap structure
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as ProcedureDeliverableItem[];
        if (Array.isArray(saved) && saved.length > 0) {
          const merged = roadmap.deliverables.map((baseItem) => {
            const match = saved.find((s) => s.deliverableCode === baseItem.deliverableCode);
            return match
              ? {
                  ...baseItem,
                  status: match.status,
                  documentRef: match.documentRef,
                  updatedAtIso: match.updatedAtIso,
                  rejectionComment: match.rejectionComment,
                }
              : baseItem;
          });
          setDeliverables(merged);
          return;
        }
      }
    } catch {
      // Ignore storage error
    }
    setDeliverables(roadmap.deliverables);
  }, [roadmap.deliverables, storageKey]);

  const persistDeliverables = (next: ProcedureDeliverableItem[]) => {
    setDeliverables(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore quota errors
    }
  };

  const metrics = useMemo(
    () => computeDeliverablesMetrics(deliverables),
    [deliverables]
  );

  const visibleDeliverables = useMemo(
    () =>
      phaseFilter === 0
        ? deliverables
        : deliverables.filter((d) => d.phase === phaseFilter),
    [deliverables, phaseFilter]
  );

  return (
    <div className="space-y-5 rounded-2xl border border-gov-navy/20 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0A1F3D] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">
            <GitMerge className="h-3 w-3" />
            Moteur d’Orchestration Procédurale
          </span>
          <h3 className="mt-1.5 text-sm font-bold text-[#0A1F3D]">
            Entrées de Maturation &rarr; Démarche Réglementaire &rarr; Suivi du Statut des Livrables
          </h3>
          <p className="text-[11px] text-slate-500">
            Calcule automatiquement les pièces requises, les organes de visa, la durée cible et pilote l’avancement de chaque livrable jusqu’à la réception.
          </p>
        </div>

        <button
          type="button"
          onClick={() => persistDeliverables(roadmap.deliverables)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#0A1F3D] hover:bg-slate-100"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Réinitialiser la feuille de route
        </button>
      </div>

      {/* 1. PARAMÈTRES D'ENTRÉE DE LA PROCÉDURE */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="font-semibold text-slate-700">Source de Financement</label>
          <select
            value={fundingCategory}
            onChange={(e) => setFundingCategory(e.target.value as FundingCategory)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          >
            <option value="FEICOM">FEICOM / Subvention CTD</option>
            <option value="BUDGET_PROPRE">Budget Propre Entité</option>
            <option value="BIP_ETAT">BIP / Budget de l’État</option>
            <option value="BAILLEUR_EXTERNE">Bailleur / Financement Extérieur</option>
          </select>
        </div>

        <div>
          <label className="font-semibold text-slate-700">Régime / Urgence</label>
          <select
            value={urgencyMode}
            onChange={(e) => setUrgencyMode(e.target.value as ProcedureUrgencyMode)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          >
            <option value="NORMALE">Procédure Normale (CMP)</option>
            <option value="URGENCE_IMPERIEUSE">Urgence Impérieuse (Art. 109)</option>
            <option value="INFRUCTUEUX_ANTERIEUR">Suite Appel d’Offres Infructueux</option>
          </select>
        </div>

        <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={requiresLandSite}
            onChange={(e) => setRequiresLandSite(e.target.checked)}
          />
          Emprise foncière / Site requis
        </label>

        <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={requiresEnvironmentalNotice}
            onChange={(e) => setRequiresEnvironmentalNotice(e.target.checked)}
          />
          Notice / EIES MINEPDED
        </label>

        <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={allotted}
            onChange={(e) => setAllotted(e.target.checked)}
          />
          Marché alloti (plusieurs lots)
        </label>
      </div>

      {/* 2. SYNTHÈSE DE LA DÉMARCHE DÉTERMINÉE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Démarche &amp; Type de Contrat</div>
          <div className="mt-1 font-bold text-[#0A1F3D]">
            {roadmap.recommendedMode} · {roadmap.contractType}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            Organe : {roadmap.commissionOrgan ?? 'Passation directe'}
            {roadmap.requiresCccm && roadmap.cccmOrgan ? ` + ${roadmap.cccmOrgan}` : ''}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Durée Cible de la Procédure</div>
          <div className="mt-1 flex items-center gap-1.5 font-bold text-[#0A1F3D]">
            <Clock className="h-3.5 w-3.5 text-[#D4AF37]" />
            {roadmap.estimatedTotalDurationDays} jours calendaires
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">
            {roadmap.deliverables.length} livrables jalonnés sur 5 phases
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Avancement des Livrables</div>
          <div className="mt-1 flex items-center justify-between font-bold text-emerald-700">
            <span>
              {metrics.completedCount} / {metrics.totalCount} validés ({metrics.progressPercent}%)
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${metrics.progressPercent}%` }}
            />
          </div>
        </div>

        <div
          className={`rounded-xl border p-3 ${
            metrics.canLaunchConsultation
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="text-[11px] font-semibold">Statut Lancement Consultation</div>
          <div className="mt-1 flex items-center gap-1.5 font-bold">
            {metrics.canLaunchConsultation ? (
              <>
                <Unlock className="h-4 w-4 text-emerald-700" />
                AUTORISÉ (Phases 1-2 prêtes)
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 text-amber-700" />
                BLOQUÉ ({metrics.blockingPendingCount} livrable(s) Phase 1-2)
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[11px] text-slate-700">
        <strong>Fondement juridique détecté :</strong> {roadmap.legalBasisSummary}
      </div>

      {/* 3. TABLEAU DE SUIVI DU STATUT DES LIVRABLES */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0A1F3D]">
            <ClipboardList className="h-4 w-4 text-[#D4AF37]" />
            Feuille de Route &amp; Suivi des Livrables ({visibleDeliverables.length})
          </div>

          <div className="flex flex-wrap gap-1 text-[11px]">
            {[
              { id: 0, label: 'Toutes phases' },
              { id: 1, label: '1. Maturation' },
              { id: 2, label: '2. Montage' },
              { id: 3, label: '3. Passation' },
              { id: 4, label: '4. Contrat' },
              { id: 5, label: '5. Exécution' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhaseFilter(p.id)}
                className={`rounded-lg border px-2.5 py-1 font-semibold ${
                  phaseFilter === p.id
                    ? 'border-[#0A1F3D] bg-[#0A1F3D] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] text-slate-600">
              <tr className="border-b border-slate-200">
                <th className="p-2.5">#</th>
                <th className="p-2.5">Étape &amp; Livrable Attendu</th>
                <th className="p-2.5">Acteur / Délai</th>
                <th className="p-2.5">Référence / Chrono</th>
                <th className="p-2.5">Statut du Livrable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleDeliverables.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="p-2.5 font-mono font-bold text-[#0A1F3D]">
                    {item.stepNumber}
                  </td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                        {item.deliverableCode}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {item.phaseLabel}
                      </span>
                      {item.blocking && (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          Bloquant
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      {item.deliverableTitle}
                    </div>
                    <div className="text-[11px] text-slate-500">{item.stepTitle}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="font-semibold text-[#0A1F3D]">
                      {item.responsibleRole}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cible : {item.targetDays}j
                    </div>
                  </td>
                  <td className="p-2.5">
                    <input
                      value={item.documentRef ?? ''}
                      onChange={(e) =>
                        persistDeliverables(
                          updateDeliverableStatus(deliverables, item.id, {
                            documentRef: e.target.value,
                          })
                        )
                      }
                      placeholder="N° Chrono / GED..."
                      className="w-36 rounded-lg border border-slate-300 px-2 py-1 font-mono text-[11px]"
                    />
                    {item.updatedAtIso && (
                      <div className="mt-0.5 text-[10px] text-slate-400">
                        MàJ : {item.updatedAtIso.slice(0, 10)}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    <select
                      value={item.status}
                      onChange={(e) =>
                        persistDeliverables(
                          updateDeliverableStatus(deliverables, item.id, {
                            status: e.target.value as DeliverableStatus,
                          })
                        )
                      }
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${
                        STATUS_BADGE[item.status]
                      }`}
                    >
                      <option value="A_PRODUIRE">À PRODUIRE</option>
                      <option value="EN_REDACTION">EN RÉDACTION</option>
                      <option value="SOUMIS_CONTROLE">SOUMIS CONTRÔLE</option>
                      <option value="VISA_OBTENU">VISA OBTENU</option>
                      <option value="SIGNE_ARCHIVE_GED">SIGNÉ &amp; ARCHIVÉ GED</option>
                      <option value="REJETE_A_CORRIGER">REJETÉ À CORRIGER</option>
                    </select>
                    {item.status === 'REJETE_A_CORRIGER' && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-rose-700">
                        <AlertCircle className="h-3 w-3" />
                        Reprise requise avant visa
                      </div>
                    )}
                    {(item.status === 'VISA_OBTENU' ||
                      item.status === 'SIGNE_ARCHIVE_GED') && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                        <ShieldCheck className="h-3 w-3" />
                        Livrable validé
                      </div>
                    )}
                    {item.status === 'A_PRODUIRE' && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                        <CheckCircle2 className="h-3 w-3 opacity-40" />
                        En attente de production
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
