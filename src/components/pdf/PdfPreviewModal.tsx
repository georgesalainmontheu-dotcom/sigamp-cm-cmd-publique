'use client';

import { CheckCircle2, Download, FileCheck2, QrCode, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GeneratedOfficialPdfResult } from '../../lib/pdf/pdfGenerator';

interface PdfPreviewModalProps {
  result: GeneratedOfficialPdfResult | null;
  onClose: () => void;
}

export function PdfPreviewModal({ result, onClose }: PdfPreviewModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setObjectUrl(null);
      return;
    }
    const normalized = new Uint8Array(result.pdfBytes.byteLength);
    normalized.set(result.pdfBytes);
    const blob = new Blob([normalized.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [result]);

  if (!result) return null;

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gov-navy px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-6 w-6 text-gov-gold" />
            <div>
              <h3 className="text-base font-semibold">
                Document Officiel Scellé — {result.fileName}
              </h3>
              <p className="text-xs text-slate-300">
                {result.pageCount} page(s) · Scellé SHA-256 & QR Code enregistrés dans audit_logs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-lg bg-gov-gold px-4 py-2 text-xs font-semibold text-gov-navy hover:brightness-105"
            >
              <Download className="h-4 w-4" />
              Télécharger PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
          {/* Prévisualisation PDF */}
          <div className="col-span-2 flex flex-col bg-slate-100 p-3">
            {objectUrl ? (
              <iframe
                src={objectUrl}
                title={result.fileName}
                className="h-[68vh] w-full rounded-lg border border-slate-300 bg-white"
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                Préparation du PDF...
              </div>
            )}
          </div>

          {/* Panneau Scellé Cryptographique */}
          <div className="flex flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-slate-50 p-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-emerald-900">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="h-4 w-4 text-gov-emerald" />
                Intégrité Cryptographique Vérifiée
              </div>
              <p className="mt-1 text-xs text-emerald-800">
                Émis le {new Date(result.issuedAtIso).toLocaleString('fr-FR')} et journalisé localement.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-gov-navy">
                <QrCode className="h-4 w-4 text-gov-gold" />
                QR Code de Vérification
              </div>
              <img
                src={result.qrDataUrl}
                alt="QR Code de vérification"
                className="mx-auto h-36 w-36 rounded-lg border border-slate-200 p-1"
              />
              <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                ID : {result.qrVerificationId}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="text-xs font-semibold text-gov-navy">Empreinte SHA-256</div>
              <p className="mt-1 break-all rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-700">
                {result.sha256Seal}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gov-navy">
                <CheckCircle2 className="h-4 w-4 text-gov-emerald" />
                Trace Immuable audit_logs
              </div>
              <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-900 p-2.5 text-[10px] text-emerald-300">
                {JSON.stringify(result.auditLogEntry, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
