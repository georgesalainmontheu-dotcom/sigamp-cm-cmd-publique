'use client';

import {
  CheckCircle2,
  FileArchive,
  FileSearch,
  Gavel,
  Send,
  UploadCloud,
  Wallet,
} from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import {
  getOfflineDb,
  queueScannedAttachment,
  saveOfflineRecord,
  type ScannedAttachmentRecord,
} from '../../lib/offline/offlineStore';
import type { ActiveRoleProfile } from '../../lib/ui/demoProfiles';

const OPEN_TENDERS = [
  {
    id: 'aao-1',
    number: '005/AONO/CB/CDPM/2026',
    entity: 'Commune de Bafang',
    title: 'Construction de 06 boutiques modernes au marché central (Lot 1)',
    budgetTtc: 120_000_000,
    deadline: '2026-12-18 13:00',
    bidBond: 2_400_000,
  },
  {
    id: 'aao-2',
    number: '008/DC/CB/SIGAMP/2026',
    entity: 'Commune de Bafang',
    title: 'Fourniture de matériel de bureau et équipements solaires',
    budgetTtc: 24_500_000,
    deadline: '2026-12-09 12:00',
    bidBond: 0,
  },
];

export function BidderPortalWorkspace({ profile }: { profile: ActiveRoleProfile }) {
  const [selectedTender, setSelectedTender] = useState(OPEN_TENDERS[0]!.number);
  const [attachments, setAttachments] = useState<ScannedAttachmentRecord[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [disputeMotif, setDisputeMotif] = useState('');
  const [disputeSent, setDisputeSent] = useState<string | null>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const db = getOfflineDb();

    for (const file of Array.from(files)) {
      const arrayBuf = await file.arrayBuffer();
      const record = await queueScannedAttachment(db, {
        entityId: profile.entityId,
        relatedTable: 'bids',
        relatedRecordId: `bid-${selectedTender}`,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        bytes: new Uint8Array(arrayBuf),
      });
      setAttachments((prev) => [record, ...prev]);
    }
  };

  const handleSubmitBid = async () => {
    const db = getOfflineDb();
    await saveOfflineRecord(db, 'bids', {
      id: `bid-${Date.now()}`,
      entity_id: profile.entityId,
      tender_number: selectedTender,
      supplier_name: profile.fullName,
      attachments_count: attachments.length,
      submitted_at: new Date().toISOString(),
    });
    setSubmissionStatus(
      `Soumission horodatée pour le DAO ${selectedTender} avec ${attachments.length} pièce(s) compressée(s) et mise(s) en file de synchronisation.`
    );
  };

  const handleFileDispute = async () => {
    if (!disputeMotif.trim()) return;
    const db = getOfflineDb();
    const disputeId = `REC-${Date.now()}`;
    await saveOfflineRecord(db, 'disputes', {
      id: disputeId,
      entity_id: profile.entityId,
      tender_number: selectedTender,
      claimant_name: profile.fullName,
      grounds_summary: disputeMotif,
      filed_at: new Date().toISOString(),
    });
    setDisputeSent(
      `Recours ${disputeId} enregistré. Le contrôle du délai de 5 jours ouvrables et l'effet suspensif sont déclenchés côté Maître d'Ouvrage.`
    );
    setDisputeMotif('');
  };

  return (
    <div className="space-y-6">
      {/* Consultation des AAO */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
          <FileSearch className="h-4 w-4 text-gov-gold" />
          Avis d&apos;Appels d&apos;Offres &amp; Cotations Ouverts
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
          {OPEN_TENDERS.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTender(t.number)}
              className={`cursor-pointer rounded-xl border p-4 transition ${
                selectedTender === t.number
                  ? 'border-gov-navy bg-slate-50 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-gov-navy">{t.number}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Clôture : {t.deadline}
                </span>
              </div>
              <p className="mt-2 font-medium text-slate-800">{t.title}</p>
              <div className="mt-2 flex justify-between text-slate-500">
                <span>Estimation : {t.budgetTtc.toLocaleString('fr-FR')} FCFA</span>
                <span>Caution : {t.bidBond.toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Soumission dématérialisée avec compression client-side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
            <UploadCloud className="h-4 w-4 text-gov-gold" />
            Soumission Dématérialisée (Compression Client-Side &amp; SHA-256)
          </h3>
          <p className="text-xs text-slate-600">
            DAO sélectionné : <strong>{selectedTender}</strong>. Vos scans (Attestation Non-Redevance,
            CNPS, Caution, Offre) sont compressés localement avant envoi.
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-xs text-slate-600 hover:border-gov-navy">
            <FileArchive className="mb-2 h-6 w-6 text-gov-navy" />
            <span>Sélectionner des pièces scannées (JPEG, PNG, PDF)</span>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => void handleFileUpload(e)}
              className="hidden"
            />
          </label>

          {attachments.length > 0 && (
            <div className="space-y-2 text-xs">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{att.fileName}</div>
                    <div className="font-mono text-[10px] text-slate-500">
                      {(att.originalSizeBytes / 1024).toFixed(1)} KB &rarr;{' '}
                      {(att.compressedSizeBytes / 1024).toFixed(1)} KB (SHA-256:{' '}
                      {att.sha256.slice(0, 12)}…)
                    </div>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {att.uploadStatus}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSubmitBid()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gov-navy py-2.5 text-xs font-semibold text-white hover:bg-gov-navyLight"
          >
            <Send className="h-4 w-4 text-gov-gold" />
            Déposer l&apos;offre horodatée
          </button>

          {submissionStatus && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-gov-emerald" />
              {submissionStatus}
            </div>
          )}
        </div>

        {/* Suivi Décomptes & Dépôt de Recours */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Wallet className="h-4 w-4 text-gov-gold" />
              Suivi de Mes Décomptes &amp; Paiements
            </h3>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <div className="font-semibold text-gov-navy">Décompte Provisoire n° 02</div>
                  <div className="text-slate-500">Marché LC-2026-004/CB · Net : 14 250 000 FCFA</div>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                  VISE CF — EN PAIEMENT
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gov-navy">
              <Gavel className="h-4 w-4 text-gov-crimson" />
              Déposer un Recours Préalable (Délai 5 Jours Ouvrables)
            </h3>
            <textarea
              value={disputeMotif}
              onChange={(e) => setDisputeMotif(e.target.value)}
              rows={3}
              placeholder="Exposez vos griefs motivés (ex: contestation élimination administrative, note technique, OAB)..."
              className="w-full rounded-xl border border-slate-300 p-3 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleFileDispute()}
              className="rounded-xl bg-gov-crimson px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              Enregistrer la Saisine (Effet Suspensif)
            </button>
            {disputeSent && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {disputeSent}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
