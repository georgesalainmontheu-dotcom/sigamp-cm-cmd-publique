'use client';

import {
  Archive,
  CheckCircle2,
  Download,
  FileCheck2,
  FolderOpen,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildAuditDossierCoverPdf,
  GED_FOLDER_DEFINITIONS,
  resolveGedFolderForAct,
  searchGedDocumentsLocal,
  type GedDocumentRecord,
  type GedFolderCode,
  type GedLifecycleStatus,
} from '../../lib/domain/gedArchiveEngine';
import { computeSha256Hex } from '../../lib/offline/offlineStore';
import { buildAuthenticatedJsonHeaders } from '../../lib/supabase/client';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';

const DEMO_GED_SEED: GedDocumentRecord[] = [
  {
    id: 'demo-ged-01',
    entity_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'BAF-2026-011',
    folder_code: '01_MATURATION_BUDGET',
    document_category: 'MATURATION',
    act_code: 'ACT_31_CERTIFICAT_DISPONIBILITE_CREDITS',
    title: 'Certificat de Disponibilité des Crédits — BAF-2026-011 (Voirie Urbaine)',
    chrono_number: 'CDC/011/C-BAF/CF/2026',
    file_name: 'Certificat_Disponibilite_BAF_2026_011.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 184320,
    sha256_hash: '7f9e1a32c8b09d44f00a1983d2e4c9f8b7a6d5c4e3f2a1b0c9d8e7f6a5b4c3d2',
    version_number: 1,
    lifecycle_status: 'SIGNE_SCELLE',
    qr_verification_id: 'SIGAMP-7F9E1A32C8B0',
    actor_role: 'CONTROLEUR_FINANCIER',
    created_at: '2026-02-10T09:15:00Z',
    content_text: 'Crédits disponibles : 48 500 000 FCFA TTC sur imputation BIP/Budget Communal Bafang.',
  },
  {
    id: 'demo-ged-02',
    entity_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'BAF-2026-011',
    folder_code: '02_LANCEMENT_DAO_DC',
    document_category: 'DOSSIER_COTATION',
    act_code: 'DT_DEMANDE_COTATION',
    title: 'Dossier de Demande de Cotation N° 011/DC/C-BAF/CDPM-HN/2026 — Pavage Rue Marché',
    chrono_number: '011/DC/C-BAF/2026',
    file_name: 'DC_011_C_BAF_2026_Complet.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 1420800,
    sha256_hash: 'a4c8d2e1b7f9035682a1c4d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7',
    version_number: 2,
    lifecycle_status: 'SIGNE_SCELLE',
    qr_verification_id: 'SIGAMP-A4C8D2E1B7F9',
    actor_role: 'SIGAMP',
    created_at: '2026-02-18T11:30:00Z',
    content_text: 'Demande de Cotation conforme au Modèle ARMP (Pièces I à VII), validité 90 jours.',
  },
  {
    id: 'demo-ged-03',
    entity_id: '11111111-1111-4111-8111-111111111111',
    project_id: 'BAF-2026-014',
    folder_code: '03_OUVERTURE_ANALYSE',
    document_category: 'PV_ATTRIBUTION',
    act_code: 'ACT_26_PV_PROPOSITION_ATTRIBUTION_ET_INDEMNITES',
    title: 'PV Proposition Attribution & Rapport SCA — BAF-2026-014 (Equipement CSI)',
    chrono_number: 'PV/014/CDPM-HN/2026',
    file_name: 'PV_Attribution_BAF_2026_014.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 342100,
    sha256_hash: '9d3c1e7b5a2f8041c6e9b2d5a8f1c4e7b0d3a6f9c2e5b8d1a4f7c0e3b6d9a2f5',
    version_number: 1,
    lifecycle_status: 'VALIDE',
    actor_role: 'CPM_PRESIDENT',
    created_at: '2026-03-04T15:40:00Z',
    content_text: 'Proposition d’attribution retenue par la CDPM du Haut-Nkam après analyse SCA.',
  },
];

export function GedArchiveWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [docs, setDocs] = useState<GedDocumentRecord[]>(DEMO_GED_SEED);
  const [selectedFolder, setSelectedFolder] = useState<GedFolderCode | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<GedLifecycleStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Formulaire de dépôt GED
  const [newTitle, setNewTitle] = useState('');
  const [newChrono, setNewChrono] = useState('045/C-BAF/SIGAMP/2026');
  const [newFolder, setNewFolder] = useState<GedFolderCode>('02_LANCEMENT_DAO_DC');
  const [newCategory, setNewCategory] = useState('ACTE_REGLEMENTAIRE');
  const [newContent, setNewContent] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);

  const fetchGedDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch(
        `/api/ged?entityId=${encodeURIComponent(profile.entityId)}`,
        { headers }
      );
      if (res.ok) {
        const json = (await res.json()) as { documents?: GedDocumentRecord[] };
        if (json.documents && json.documents.length > 0) {
          setDocs(json.documents);
        }
      }
    } catch {
      // Conservation du fallback local si offline
    } finally {
      setLoading(false);
    }
  }, [profile.entityId]);

  useEffect(() => {
    void fetchGedDocuments();
  }, [fetchGedDocuments]);

  const filteredDocs = useMemo(
    () =>
      searchGedDocumentsLocal(docs, {
        folderCode: selectedFolder,
        status: selectedStatus,
        query: searchQuery,
      }),
    [docs, selectedFolder, selectedStatus, searchQuery]
  );

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of docs) {
      counts[d.folder_code] = (counts[d.folder_code] ?? 0) + 1;
    }
    return counts;
  }, [docs]);

  const handleArchiveSubmit = async () => {
    if (!newTitle.trim()) return;
    setStatusMessage(null);
    const fileName =
      newFile?.name ||
      `${newTitle.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40)}.pdf`;
    const size = newFile?.size ?? Math.max(newContent.length, 512);
    const bytesOrText = newFile ? new Uint8Array(await newFile.arrayBuffer()) : `${newTitle}|${newContent}`;
    const sha256 = await computeSha256Hex(bytesOrText);
    const resolvedFolder = newFolder || resolveGedFolderForAct(newCategory);

    let fileBase64: string | undefined;
    if (newFile && newFile.size <= 4 * 1024 * 1024 && bytesOrText instanceof Uint8Array) {
      let binary = '';
      for (let i = 0; i < bytesOrText.length; i += 1) {
        binary += String.fromCharCode(bytesOrText[i]!);
      }
      fileBase64 = btoa(binary);
    }

    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch('/api/ged', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'ARCHIVE',
          entityId: profile.entityId,
          folderCode: resolvedFolder,
          documentCategory: newCategory,
          title: newTitle.trim(),
          chronoNumber: newChrono.trim(),
          fileName,
          mimeType: newFile?.type || 'application/pdf',
          fileSizeBytes: size,
          sha256Hash: sha256,
          contentText: newContent.trim() || newTitle.trim(),
          fileBase64,
          lifecycleStatus: 'SIGNE_SCELLE',
          actorRole: profile.roleCode,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { document: GedDocumentRecord };
        setDocs((prev) => [json.document, ...prev]);
        setStatusMessage(`Pièce archivée en GED (${resolvedFolder}) · SHA-256 : ${sha256.slice(0, 16)}...`);
      } else {
        // Fallback local offline
        const localDoc: GedDocumentRecord = {
          id: `local-${Date.now()}`,
          entity_id: profile.entityId,
          project_id: null,
          folder_code: resolvedFolder,
          document_category: newCategory,
          title: newTitle.trim(),
          chrono_number: newChrono.trim(),
          file_name: fileName,
          mime_type: newFile?.type || 'application/pdf',
          file_size_bytes: size,
          sha256_hash: sha256,
          version_number: 1,
          lifecycle_status: 'SIGNE_SCELLE',
          content_text: newContent.trim(),
          actor_role: profile.roleCode,
          created_at: new Date().toISOString(),
        };
        setDocs((prev) => [localDoc, ...prev]);
        setStatusMessage(`Pièce indexée localement (mode hors-ligne) · SHA-256 : ${sha256.slice(0, 16)}...`);
      }
      setNewTitle('');
      setNewContent('');
      setNewFile(null);
      setShowUploadForm(false);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erreur archivage GED.');
    }
  };

  const handleDownloadStoredFile = async (storagePath: string) => {
    try {
      const headers = await buildAuthenticatedJsonHeaders();
      const res = await fetch(
        `/api/ged?entityId=${encodeURIComponent(profile.entityId)}&downloadPath=${encodeURIComponent(
          storagePath
        )}`,
        { headers }
      );
      const json = (await res.json()) as { signedUrl?: string; error?: string };
      if (res.ok && json.signedUrl) {
        window.open(json.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        setStatusMessage(json.error ?? 'Impossible de récupérer la pièce Storage.');
      }
    } catch {
      setStatusMessage('Erreur lors de l’ouverture du lien signé Storage.');
    }
  };

  const handleExportAuditDossier = async () => {
    const { pdfBytes, sha256 } = await buildAuditDossierCoverPdf({
      entityName: profile.entityName,
      projectCode: profile.entityCode,
      projectTitle: `Dossier Complet GED (${filteredDocs.length} pièces indexées)`,
      documents: filteredDocs,
    });

    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dossier_Audit_GED_${profile.entityCode}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`Dossier d'Audit CONSUPE/ARMP généré (${filteredDocs.length} pièces) · SHA-256 : ${sha256.slice(0, 16)}...`);
  };

  return (
    <div className="space-y-6">
      {/* En-tête GED Régalienne */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-gov-navy" />
            <h2 className="text-lg font-bold text-gov-navy">
              GED Régalienne & Coffre-Fort Numérique des Marchés
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
              Scellement SHA-256 · 6 Chemises
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Classement normalisé ARMP/CONSUPE, versionnage horodaté et export d’audit en 1 clic pour{' '}
            <strong>{profile.entityName}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gov-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-gov-navyLight"
          >
            <Plus className="h-4 w-4 text-gov-gold" />
            Archiver une pièce
          </button>
          <button
            type="button"
            onClick={() => void handleExportAuditDossier()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gov-gold bg-gov-gold/15 px-3.5 py-2 text-xs font-semibold text-gov-navy hover:bg-gov-gold/25"
          >
            <Download className="h-4 w-4" />
            Export Dossier Audit (.pdf)
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>{statusMessage}</span>
        </div>
      )}

      {showUploadForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gov-navy">
            Dépôt & Scellement d’une pièce dans la GED Régalienne
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Intitulé officiel de la pièce
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: PV Ouverture Plis DC 011/C-BAF"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Chemise réglementaire (01 à 06 / 00)
              </label>
              <select
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value as GedFolderCode)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              >
                {GED_FOLDER_DEFINITIONS.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Numéro Chrono / Référence
              </label>
              <input
                value={newChrono}
                onChange={(e) => setNewChrono(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600">
                Catégorie documentaire
              </label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                Fichier numérisé (PDF / DOCX / Image) — Empreinte SHA-256 calculée automatiquement
              </label>
              <input
                type="file"
                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-600">
                Résumé / Mots-clés d’indexation plein texte
              </label>
              <textarea
                rows={2}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Objet, attributaire, montant, références ARMP..."
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleArchiveSubmit()}
              className="rounded-xl bg-gov-navy px-4 py-1.5 text-xs font-semibold text-white"
            >
              Sceller & Archiver
            </button>
          </div>
        </div>
      )}

      {/* Grille des 6 Chemises Régaliennes + Recherche */}
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-4">
          <button
            type="button"
            onClick={() => setSelectedFolder('ALL')}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition ${
              selectedFolder === 'ALL'
                ? 'border-gov-navy bg-gov-navy text-white'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-gov-gold" />
              Toutes les chemises
            </span>
            <span className="rounded-full bg-black/15 px-2 py-0.5 text-[11px]">
              {docs.length}
            </span>
          </button>

          {GED_FOLDER_DEFINITIONS.map((folder) => {
            const active = selectedFolder === folder.code;
            const count = folderCounts[folder.code] ?? 0;
            return (
              <button
                key={folder.code}
                type="button"
                onClick={() => setSelectedFolder(folder.code)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-gov-navy bg-gov-navy text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-gov-navy/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{folder.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      active ? 'bg-gov-gold text-gov-navy' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {count}
                  </span>
                </div>
                <p
                  className={`mt-1 text-[11px] leading-snug ${
                    active ? 'text-slate-200' : 'text-slate-500'
                  }`}
                >
                  {folder.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Liste des pièces & Barre de recherche */}
        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par titre, n° chrono, hash SHA-256, mot-clé..."
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs focus:border-gov-navy focus:outline-none"
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as GedLifecycleStatus | 'ALL')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
            >
              <option value="ALL">Tous statuts</option>
              <option value="SIGNE_SCELLE">Signé & Scellé</option>
              <option value="VALIDE">Validé</option>
              <option value="BROUILLON">Brouillon</option>
              <option value="ARCHIVE">Archivé clos</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {loading && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
                Synchronisation de la GED Supabase en cours...
              </div>
            )}
            {filteredDocs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
                Aucune pièce archivée ne correspond à ces filtres dans cette chemise.
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-gov-navy/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-gov-navy">
                          {doc.folder_code}
                        </span>
                        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                          {doc.lifecycle_status} · v{doc.version_number}
                        </span>
                        {doc.chrono_number && (
                          <span className="text-[11px] font-medium text-slate-500">
                            Chrono : {doc.chrono_number}
                          </span>
                        )}
                      </div>
                      <h4 className="mt-1.5 text-sm font-bold text-slate-900">{doc.title}</h4>
                      {doc.content_text && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                          {doc.content_text}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <div className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {doc.sha256_hash.slice(0, 14)}...
                      </div>
                      <div className="mt-1">{doc.file_name}</div>
                      <div>{new Date(doc.created_at).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    <span>
                      Catégorie : <strong>{doc.document_category}</strong> · Taille :{' '}
                      {Math.max(1, Math.round(doc.file_size_bytes / 1024))} Ko
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      {doc.storage_path && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadStoredFile(doc.storage_path!)}
                          className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Télécharger original (Storage)
                        </button>
                      )}
                      {doc.qr_verification_id && (
                        <a
                          href={`/verify/${doc.qr_verification_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-gov-navy hover:underline"
                        >
                          <FileCheck2 className="h-3.5 w-3.5 text-gov-gold" />
                          Vérifier sceau QR ({doc.qr_verification_id})
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
