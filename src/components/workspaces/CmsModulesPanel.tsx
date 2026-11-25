'use client';

import {
  CheckCircle2,
  Download,
  FileCode2,
  GitBranch,
  Lock,
  Plus,
  ShieldCheck,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type {
  CmsActTemplateOverride,
  CmsCommissionMember,
  CmsGedPolicyConfig,
  CmsVendorRecord,
  CmsWorkflowRule,
  EntityVisualIdentity,
  StudioDocumentBlock,
} from '../../lib/domain/entityStudioEngine';

export interface AuditLogRow {
  id: string;
  action: string;
  table_name: string | null;
  actor_role: string | null;
  details?: unknown;
  created_at: string;
}

interface CmsModulesPanelProps {
  section:
    | 'ACT_TEMPLATES'
    | 'WORKFLOWS_VISAS'
    | 'COMMISSIONS_SCALES'
    | 'VENDORS_MERCURIALE'
    | 'AUDIT_SECURITY';
  identity: EntityVisualIdentity;
  blocks: StudioDocumentBlock[];
  actTemplates: CmsActTemplateOverride[];
  setActTemplates: React.Dispatch<React.SetStateAction<CmsActTemplateOverride[]>>;
  workflowRules: CmsWorkflowRule[];
  setWorkflowRules: React.Dispatch<React.SetStateAction<CmsWorkflowRule[]>>;
  commissionMembers: CmsCommissionMember[];
  setCommissionMembers: React.Dispatch<React.SetStateAction<CmsCommissionMember[]>>;
  vendors: CmsVendorRecord[];
  setVendors: React.Dispatch<React.SetStateAction<CmsVendorRecord[]>>;
  gedPolicy: CmsGedPolicyConfig;
  setGedPolicy: React.Dispatch<React.SetStateAction<CmsGedPolicyConfig>>;
  auditLogs: AuditLogRow[];
  onPublishNow: () => void;
}

export function CmsModulesPanel({
  section,
  identity,
  blocks,
  actTemplates,
  setActTemplates,
  workflowRules,
  setWorkflowRules,
  commissionMembers,
  setCommissionMembers,
  vendors,
  setVendors,
  gedPolicy,
  setGedPolicy,
  auditLogs,
  onPublishNow,
}: CmsModulesPanelProps) {
  const [newActCode, setNewActCode] = useState('');
  const [newActLabel, setNewActLabel] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Membre Technique');
  const [newMemberOrgan, setNewMemberOrgan] = useState<CmsCommissionMember['organ']>('CDPM');
  const [newMemberRef, setNewMemberRef] = useState('Décision N° 2026/');
  const [newMemberFee, setNewMemberFee] = useState(75000);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorNiu, setNewVendorNiu] = useState('');
  const [newVendorDomain, setNewVendorDomain] = useState('BTP / Fournitures');
  const [vendorSearch, setVendorSearch] = useState('');

  if (section === 'ACT_TEMPLATES') {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
              <FileCode2 className="h-4 w-4 text-[#D4AF37]" />
              Catalogue des Modèles d’Actes &amp; Clauses Institutionnelles
            </h2>
            <p className="text-[11px] text-slate-500">
              Personnalisez les préfixes chrono, visas réglementaires, clauses et sceau QR appliqués à {identity.entityName}.
            </p>
          </div>
          <button
            type="button"
            onClick={onPublishNow}
            className="rounded-xl bg-[#0A1F3D] px-3 py-1.5 font-semibold text-[#D4AF37]"
          >
            Enregistrer en base
          </button>
        </div>

        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
          <input
            value={newActCode}
            onChange={(e) => setNewActCode(e.target.value)}
            placeholder="Code (ex: ACT-NOTE-CADRAGE)"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
          <input
            value={newActLabel}
            onChange={(e) => setNewActLabel(e.target.value)}
            placeholder="Intitulé du modèle d’acte"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <button
            type="button"
            onClick={() => {
              if (!newActCode.trim() || !newActLabel.trim()) return;
              setActTemplates((prev) => [
                {
                  actCode: newActCode.trim().toUpperCase(),
                  label: newActLabel.trim(),
                  category: 'Actes Personnalisés',
                  enabled: true,
                  chronoPrefix: 'ACT/SIGAMP',
                  customVisas: 'Vu le Décret N° 2018/366 portant Code des Marchés Publics',
                  customClauses: '',
                  requiresSealQr: true,
                },
                ...prev,
              ]);
              setNewActCode('');
              setNewActLabel('');
            }}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0A1F3D] px-3 py-1.5 font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter modèle
          </button>
        </div>

        <div className="space-y-3">
          {actTemplates.map((act) => (
            <div
              key={act.actCode}
              className="space-y-2 rounded-xl border border-slate-200 p-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#0A1F3D]">
                    {act.actCode}
                  </span>{' '}
                  <strong className="text-slate-900">{act.label}</strong>
                  <span className="ml-2 text-[10px] text-slate-500">· {act.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={act.requiresSealQr}
                      onChange={(e) =>
                        setActTemplates((prev) =>
                          prev.map((a) =>
                            a.actCode === act.actCode
                              ? { ...a, requiresSealQr: e.target.checked }
                              : a
                          )
                        )
                      }
                    />
                    Sceau QR
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-semibold">
                    <input
                      type="checkbox"
                      checked={act.enabled}
                      onChange={(e) =>
                        setActTemplates((prev) =>
                          prev.map((a) =>
                            a.actCode === act.actCode
                              ? { ...a, enabled: e.target.checked }
                              : a
                          )
                        )
                      }
                    />
                    Actif
                  </label>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500">
                    Préfixe Chrono
                  </label>
                  <input
                    value={act.chronoPrefix}
                    onChange={(e) =>
                      setActTemplates((prev) =>
                        prev.map((a) =>
                          a.actCode === act.actCode
                            ? { ...a, chronoPrefix: e.target.value }
                            : a
                        )
                      )
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500">
                    Visas réglementaires par défaut
                  </label>
                  <input
                    value={act.customVisas}
                    onChange={(e) =>
                      setActTemplates((prev) =>
                        prev.map((a) =>
                          a.actCode === act.actCode
                            ? { ...a, customVisas: e.target.value }
                            : a
                        )
                      )
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500">
                  Clauses types obligatoires
                </label>
                <textarea
                  rows={2}
                  value={act.customClauses}
                  onChange={(e) =>
                    setActTemplates((prev) =>
                      prev.map((a) =>
                        a.actCode === act.actCode
                          ? { ...a, customClauses: e.target.value }
                          : a
                      )
                    )
                  }
                  className="mt-0.5 w-full rounded-lg border border-slate-300 p-2"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'WORKFLOWS_VISAS') {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
              <GitBranch className="h-4 w-4 text-[#D4AF37]" />
              Workflows, Circuits de Visa &amp; Délais CMP
            </h2>
            <p className="text-[11px] text-slate-500">
              Paramétrez les étapes de validation, délais cibles et blocages réglementaires par seuil de procédure.
            </p>
          </div>
          <button
            type="button"
            onClick={onPublishNow}
            className="rounded-xl bg-[#0A1F3D] px-3 py-1.5 font-semibold text-[#D4AF37]"
          >
            Enregistrer en base
          </button>
        </div>

        <div className="space-y-3">
          {workflowRules.map((wf) => (
            <div key={wf.id} className="space-y-2 rounded-xl border border-slate-200 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[#0A1F3D]">{wf.procedureLabel}</strong>
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700">
                    {wf.thresholdRange}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={wf.blockingControl}
                      onChange={(e) =>
                        setWorkflowRules((prev) =>
                          prev.map((r) =>
                            r.id === wf.id ? { ...r, blockingControl: e.target.checked } : r
                          )
                        )
                      }
                    />
                    Visa bloquant
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-semibold">
                    <input
                      type="checkbox"
                      checked={wf.active}
                      onChange={(e) =>
                        setWorkflowRules((prev) =>
                          prev.map((r) =>
                            r.id === wf.id ? { ...r, active: e.target.checked } : r
                          )
                        )
                      }
                    />
                    Actif
                  </label>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-3">
                  <label className="text-[10px] font-semibold text-slate-500">
                    Étapes du circuit (séparées par « &gt; »)
                  </label>
                  <input
                    value={wf.steps.join(' > ')}
                    onChange={(e) =>
                      setWorkflowRules((prev) =>
                        prev.map((r) =>
                          r.id === wf.id
                            ? {
                                ...r,
                                steps: e.target.value
                                  .split('>')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : r
                        )
                      )
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500">
                    Délai légal max (jours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={wf.maxLegalDays}
                    onChange={(e) =>
                      setWorkflowRules((prev) =>
                        prev.map((r) =>
                          r.id === wf.id
                            ? { ...r, maxLegalDays: Number(e.target.value) || 1 }
                            : r
                        )
                      )
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {wf.steps.map((step, i) => (
                  <span
                    key={`${wf.id}-s-${i}`}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-[#0A1F3D]"
                  >
                    {i + 1}. {step}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'COMMISSIONS_SCALES') {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
              <Users className="h-4 w-4 text-[#D4AF37]" />
              Commissions (CDPM/CIPM/CRPM/SCA) &amp; Barèmes d’Indemnités
            </h2>
            <p className="text-[11px] text-slate-500">
              Gérez la composition nominative, les arrêtés de nomination et les indemnités de session.
            </p>
          </div>
          <button
            type="button"
            onClick={onPublishNow}
            className="rounded-xl bg-[#0A1F3D] px-3 py-1.5 font-semibold text-[#D4AF37]"
          >
            Enregistrer en base
          </button>
        </div>

        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-5">
          <input
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Nom & Prénom"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <input
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value)}
            placeholder="Fonction (Président, Rapporteur...)"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <select
            value={newMemberOrgan}
            onChange={(e) => setNewMemberOrgan(e.target.value as CmsCommissionMember['organ'])}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
          >
            <option value="CDPM">CDPM</option>
            <option value="CIPM">CIPM</option>
            <option value="CRPM">CRPM</option>
            <option value="SCA">SCA</option>
          </select>
          <input
            type="number"
            value={newMemberFee}
            onChange={(e) => setNewMemberFee(Number(e.target.value) || 0)}
            placeholder="Indemnité FCFA"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
          <button
            type="button"
            onClick={() => {
              if (!newMemberName.trim()) return;
              setCommissionMembers((prev) => [
                ...prev,
                {
                  id: `mem-${Date.now()}`,
                  fullName: newMemberName.trim(),
                  roleInCommission: newMemberRole.trim() || 'Membre',
                  organ: newMemberOrgan,
                  appointmentRef: newMemberRef.trim(),
                  indemnityFcfa: newMemberFee,
                  active: true,
                },
              ]);
              setNewMemberName('');
            }}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0A1F3D] px-3 py-1.5 font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        <div className="space-y-2">
          {commissionMembers.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
            >
              <div>
                <span className="rounded bg-[#0A1F3D] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#D4AF37]">
                  {m.organ}
                </span>{' '}
                <strong className="text-slate-900">{m.fullName}</strong> — {m.roleInCommission}
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Acte : {m.appointmentRef} · Indemnité :{' '}
                  <strong>{m.indemnityFcfa.toLocaleString('fr-FR')} FCFA / session</strong>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCommissionMembers((prev) =>
                      prev.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x))
                    )
                  }
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    m.active
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {m.active ? 'ACTIF' : 'SUSPENDU'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCommissionMembers((prev) => prev.filter((x) => x.id !== m.id))
                  }
                  className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'VENDORS_MERCURIALE') {
    const filteredVendors = vendors.filter(
      (v) =>
        v.businessName.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        v.niu.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        v.domain.toLowerCase().includes(vendorSearch.toLowerCase())
    );
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
              <Store className="h-4 w-4 text-[#D4AF37]" />
              Annuaire Fournisseurs, Prestataires &amp; Conformité ARMP
            </h2>
            <p className="text-[11px] text-slate-500">
              Base locale des entreprises consultables (Demande de Cotation / AONO), suivi NIU &amp; liste d’exclusion ARMP.
            </p>
          </div>
          <button
            type="button"
            onClick={onPublishNow}
            className="rounded-xl bg-[#0A1F3D] px-3 py-1.5 font-semibold text-[#D4AF37]"
          >
            Enregistrer en base
          </button>
        </div>

        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
          <input
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            placeholder="Raison sociale entreprise"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <input
            value={newVendorNiu}
            onChange={(e) => setNewVendorNiu(e.target.value)}
            placeholder="NIU (ex: M0419...)"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
          <input
            value={newVendorDomain}
            onChange={(e) => setNewVendorDomain(e.target.value)}
            placeholder="Domaine (BTP, TIC...)"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <button
            type="button"
            onClick={() => {
              if (!newVendorName.trim()) return;
              setVendors((prev) => [
                {
                  id: `vnd-${Date.now()}`,
                  businessName: newVendorName.trim().toUpperCase(),
                  niu: newVendorNiu.trim().toUpperCase() || 'À COMPLÉTER',
                  rcNumber: 'RC/CM/2026',
                  domain: newVendorDomain.trim(),
                  city: identity.municipality,
                  phone: '(+237) 600 00 00 00',
                  taxStatus: 'CONFORME',
                  blacklisted: false,
                },
                ...prev,
              ]);
              setNewVendorName('');
              setNewVendorNiu('');
            }}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#0A1F3D] px-3 py-1.5 font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Enregistrer prestataire
          </button>
        </div>

        <input
          value={vendorSearch}
          onChange={(e) => setVendorSearch(e.target.value)}
          placeholder="Rechercher un prestataire par nom, NIU ou secteur..."
          className="w-full rounded-xl border border-slate-200 px-3 py-2"
        />

        <div className="space-y-2">
          {filteredVendors.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
            >
              <div>
                <strong className="text-slate-900">{v.businessName}</strong>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  NIU : <span className="font-mono">{v.niu}</span> · {v.domain} · {v.city}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={v.taxStatus}
                  onChange={(e) =>
                    setVendors((prev) =>
                      prev.map((x) =>
                        x.id === v.id
                          ? {
                              ...x,
                              taxStatus: e.target.value as CmsVendorRecord['taxStatus'],
                              blacklisted: e.target.value === 'SUSPENDU_ARMP',
                            }
                          : x
                      )
                    )
                  }
                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                    v.taxStatus === 'CONFORME'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : v.taxStatus === 'EXPIRE'
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-rose-300 bg-rose-50 text-rose-800'
                  }`}
                >
                  <option value="CONFORME">Attest. Fiscale CONFORME</option>
                  <option value="EXPIRE">Attest. EXPIRÉE</option>
                  <option value="SUSPENDU_ARMP">LISTE NOIRE ARMP</option>
                </select>
                <button
                  type="button"
                  onClick={() => setVendors((prev) => prev.filter((x) => x.id !== v.id))}
                  className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // AUDIT_SECURITY
  const handleDownloadConfigJson = () => {
    const payload = {
      exportedAtIso: new Date().toISOString(),
      identity,
      blocks,
      actTemplates,
      workflowRules,
      commissionMembers,
      vendors,
      gedPolicy,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SIGAMP_CMS_Config_${identity.entityCode}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />
            Politique GED, Sécurité, Webhooks &amp; Journal d’Audit
          </h2>
          <p className="text-[11px] text-slate-500">
            Rétention d’archives, signature numérique, export de configuration et traçabilité temps réel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadConfigJson}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter JSON
          </button>
          <button
            type="button"
            onClick={onPublishNow}
            className="rounded-xl bg-[#0A1F3D] px-3 py-1.5 font-semibold text-[#D4AF37]"
          >
            Enregistrer politique
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
        <div>
          <label className="font-semibold text-slate-700">
            Durée de rétention légale GED (années)
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={gedPolicy.retentionYears}
            onChange={(e) =>
              setGedPolicy((p) => ({
                ...p,
                retentionYears: Number(e.target.value) || 10,
              }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
        </div>
        <div>
          <label className="font-semibold text-slate-700">
            Webhook de notification externe (ARMP / Tutelle / SI)
          </label>
          <input
            value={gedPolicy.webhookUrl}
            onChange={(e) =>
              setGedPolicy((p) => ({ ...p, webhookUrl: e.target.value }))
            }
            placeholder="https://api.entite.cm/webhooks/sigamp"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
        </div>
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={gedPolicy.autoSealQr}
            onChange={(e) =>
              setGedPolicy((p) => ({ ...p, autoSealQr: e.target.checked }))
            }
          />
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          Apposer automatiquement le sceau QR SHA-256 sur tous les actes
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={gedPolicy.requireDigitalSignature}
            onChange={(e) =>
              setGedPolicy((p) => ({ ...p, requireDigitalSignature: e.target.checked }))
            }
          />
          <Lock className="h-3.5 w-3.5 text-[#0A1F3D]" />
          Exiger visa numérique avant versement dans le Coffre-Fort GED
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={gedPolicy.watermarkDrafts}
            onChange={(e) =>
              setGedPolicy((p) => ({ ...p, watermarkDrafts: e.target.checked }))
            }
          />
          Filigrane « BROUILLON / NON SIGNÉ » sur les projets non validés
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">
          <input
            type="checkbox"
            checked={gedPolicy.allowPublicAvisPortal}
            onChange={(e) =>
              setGedPolicy((p) => ({ ...p, allowPublicAvisPortal: e.target.checked }))
            }
          />
          Publication automatique sur le portail public /avis
        </label>
      </div>

      <div>
        <div className="mb-2 font-bold text-[#0A1F3D]">
          Journal d’Audit Souverain — Derniers événements ({auditLogs.length})
        </div>
        {auditLogs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-slate-500">
            Aucun événement d’audit enregistré pour cette entité pour le moment.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="p-2">Horodatage</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Rôle</th>
                  <th className="p-2">Cible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-2 font-mono text-slate-500">
                      {log.created_at.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="p-2 font-semibold text-[#0A1F3D]">{log.action}</td>
                    <td className="p-2">{log.actor_role ?? 'SYSTEM'}</td>
                    <td className="p-2 font-mono text-slate-500">{log.table_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
