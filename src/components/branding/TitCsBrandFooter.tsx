'use client';

import { ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export const TIT_CS_METADATA = {
  companyName: 'TIT-CONSULTING SOLUTIONS (TIT-CS)',
  founderName: 'Le Prince Joël NOUBISSIE TCHASSOM (Joël Tchassom)',
  slogan: 'Une intelligence, mille solutions.',
  headquarters: "Bafang, Quartier Administratif — Haut-Nkam, Région de l'Ouest, Cameroun",
  phones: ['+237 6 95 51 25 28', '+237 682 58 09 45'],
  email: 'contact@tit-cs.com',
  website: 'https://tit-cs.netlify.app',
  copyrightYear: '2026',
};

export function TitCsLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 500 500"
      width={size}
      height={size}
      className="shrink-0 rounded-lg shadow-sm"
      role="img"
      aria-label="Logo TIT-Consulting Solutions (TIT-CS)"
    >
      <rect width="500" height="500" rx="48" fill="#0A1F3D" />
      <polygon
        points="250,40 430,140 430,360 250,460 70,360 70,140"
        fill="none"
        stroke="#D4AF37"
        strokeWidth="8"
      />
      <polygon
        points="250,58 414,150 414,350 250,442 86,350 86,150"
        fill="none"
        stroke="#E8C77E"
        strokeWidth="2"
        opacity="0.65"
      />
      <g transform="translate(0, -10)">
        <path d="M 120 180 H 200 V 210 H 175 V 320 H 145 V 210 H 120 Z" fill="#D4AF37" />
        <path d="M 300 180 H 380 V 210 H 355 V 320 H 325 V 210 H 300 Z" fill="#D4AF37" />
        <rect x="220" y="180" width="60" height="20" fill="#E8C77E" />
        <rect x="220" y="300" width="60" height="20" fill="#E8C77E" />
        <rect x="240" y="200" width="20" height="35" fill="#D4AF37" />
        <rect x="240" y="265" width="20" height="35" fill="#D4AF37" />
        <circle cx="250" cy="250" r="18" fill="#F4D67A" />
        <circle cx="250" cy="250" r="10" fill="#FFFFFF" />
        <path d="M 250 232 L 250 200" stroke="#F4D67A" strokeWidth="3" />
        <path d="M 250 268 L 250 300" stroke="#F4D67A" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function TitCsBrandFooter({
  entityFooterNote,
  licenseStatusLabel,
  compact = false,
}: {
  entityFooterNote?: string;
  licenseStatusLabel?: string;
  compact?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <footer className="mt-10 border-t border-slate-200 bg-white/95 text-slate-600">
        <div
          className={`mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 ${
            compact ? 'py-4' : 'py-5'
          }`}
        >
          <div className="flex items-center gap-3">
            <TitCsLogo size={compact ? 32 : 40} />
            <div className="text-xs">
              <div className="flex flex-wrap items-center gap-2 font-bold text-[#0A1F3D]">
                <span>SIGAMP-CM</span>
                <span className="text-slate-300">|</span>
                <span>{TIT_CS_METADATA.companyName}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600">
                © {TIT_CS_METADATA.copyrightYear}{' '}
                <strong className="text-[#0A1F3D]">Joël Tchassom</strong> &amp;{' '}
                <strong className="text-[#0A1F3D]">TIT-Consulting Solutions (TIT-CS)</strong>.
                Tous droits réservés.
              </p>
              {entityFooterNote && (
                <p className="mt-0.5 text-[10px] text-slate-500">{entityFooterNote}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {licenseStatusLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                {licenseStatusLabel}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 transition hover:border-[#0A1F3D] hover:text-[#0A1F3D]"
            >
              Mentions de licence &amp; Intégrité
            </button>
            <Link
              href="/legal"
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 transition hover:border-[#0A1F3D] hover:text-[#0A1F3D]"
            >
              CGU &amp; Confidentialité
            </Link>
            <a
              href={TIT_CS_METADATA.website}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[#D4AF37]/40 bg-[#0A1F3D] px-2.5 py-1 font-semibold text-[#D4AF37] transition hover:opacity-90"
            >
              tit-cs.netlify.app
            </a>
          </div>
        </div>
      </footer>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/40 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <TitCsLogo size={42} />
                <div>
                  <h3 className="text-sm font-bold text-[#0A1F3D]">
                    Propriété Intellectuelle, Licence &amp; Intégrité
                  </h3>
                  <p className="text-xs italic text-amber-700">
                    « {TIT_CS_METADATA.slogan} »
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5 text-xs leading-relaxed text-slate-700">
              <p>
                <strong>Éditeur &amp; Concepteur :</strong> {TIT_CS_METADATA.companyName}, cabinet
                fondé par <strong>{TIT_CS_METADATA.founderName}</strong>.
              </p>
              <p>
                <strong>Siège Social :</strong> {TIT_CS_METADATA.headquarters}
              </p>
              <p>
                <strong>Contacts :</strong> {TIT_CS_METADATA.phones.join(' · ')} ·{' '}
                {TIT_CS_METADATA.email}
              </p>
              <p>
                <strong>Propriété Intellectuelle :</strong> © {TIT_CS_METADATA.copyrightYear} Joël
                Tchassom &amp; TIT-Consulting Solutions (TIT-CS). L’exploitation de SIGAMP-CM par
                chaque entité publique est encadrée par une licence d’exploitation nominative et
                vérifiable, sans altérer la souveraineté ni la valeur probante des actes
                administratifs générés par l’institution cliente.
              </p>
              <p>
                <strong>Intégrité &amp; Traçabilité :</strong> Tous les documents scellés portent
                une empreinte cryptographique SHA-256 et un QR Code vérifiable publiquement sur{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5">/verify/[sealId]</code>,
                conformément aux exigences de traçabilité (Loi n° 2010/012 / ANTIC).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
