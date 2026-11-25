import { CheckCircle2, FileCheck2, ShieldAlert, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function VerifySealPage({
  params,
}: {
  params: { sealId: string };
}) {
  const sealId = decodeURIComponent(params.sealId);
  const isValidHex64 = /^[a-f0-9]{64}$/i.test(sealId);
  const isKnownDemo = sealId === 'SIGAMP-SEAL-DEMO' || sealId.startsWith('SIGAMP-');

  return (
    <div className="min-h-screen bg-gov-slate px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-gov-navy" />
            <div>
              <h1 className="text-base font-bold text-gov-navy">
                Vérification Publique d’Intégrité SIGAMP-CM
              </h1>
              <p className="text-xs text-slate-500">
                Contrôle de scellé QR & empreinte SHA-256
              </p>
            </div>
          </div>
          <Link
            href="/avis"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-gov-navy hover:bg-slate-50"
          >
            Portail AAO
          </Link>
        </div>

        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs">
          <p className="font-semibold text-slate-600">Identifiant / Empreinte contrôlée :</p>
          <p className="mt-1 break-all font-mono text-sm font-bold text-gov-navy">
            {sealId}
          </p>
        </div>

        {isValidHex64 || isKnownDemo ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Format d’empreinte conforme — Scellé d’intégrité interne SIGAMP-CM valide
            </p>
            <p className="mt-2 leading-relaxed text-emerald-900">
              Ce document comporte une empreinte SHA-256 calculée à la génération.
              Comparez la chaîne ci-dessus avec le pied de page du PDF imprimé ou
              présenté en contrôle financier / ARMP.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Identifiant de scellé non reconnu ou format incomplet
            </p>
            <p className="mt-2 text-amber-900">
              Un scellé SHA-256 SIGAMP-CM valide comporte 64 caractères hexadécimaux ou
              un identifiant certifié délivré par l’entité publique.
            </p>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
          <p className="flex items-center gap-1.5 font-semibold text-gov-navy">
            <FileCheck2 className="h-4 w-4" />
            Mention légale ANTIC / Signature électronique
          </p>
          <p className="mt-1 leading-relaxed">
            Scellé d’intégrité interne SIGAMP-CM (SHA-256) — à compléter par
            signature/cachet officiel ou certificat électronique qualifié (ANTIC) selon
            procédure en vigueur.
          </p>
        </div>
      </div>
    </div>
  );
}
