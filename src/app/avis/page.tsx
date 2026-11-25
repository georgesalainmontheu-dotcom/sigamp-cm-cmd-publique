import { createClient } from '@supabase/supabase-js';
import { Building2, Calendar, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { TitCsBrandFooter } from '../../components/branding/TitCsBrandFooter';

export const dynamic = 'force-dynamic';

interface PublicAvisRow {
  dao_number: string;
  title: string;
  entity_name: string;
  nature: string;
  mode: string;
  estimated_amount_ttc: number;
  published_at: string | null;
  submission_deadline: string | null;
  opening_datetime: string | null;
}

const FALLBACK_AAO_LIST: PublicAvisRow[] = [
  {
    dao_number: 'AAO N° 011/AONO/C-BAF/CDPM/2026',
    title: 'Construction de 03 salles de classe équipées à l’école publique de Bafang Centre',
    entity_name: 'Commune de Bafang',
    nature: 'TRAVAUX',
    mode: 'AONO',
    estimated_amount_ttc: 48_500_000,
    published_at: null,
    submission_deadline: null,
    opening_datetime: null,
  },
];

async function fetchPublicAvis(): Promise<{ rows: PublicAvisRow[]; live: boolean }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { rows: FALLBACK_AAO_LIST, live: false };

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc('list_public_avis');
    if (error || !Array.isArray(data) || data.length === 0) {
      return { rows: FALLBACK_AAO_LIST, live: false };
    }
    return { rows: data as PublicAvisRow[], live: true };
  } catch {
    return { rows: FALLBACK_AAO_LIST, live: false };
  }
}

export default async function PublicAvisPage() {
  const { rows, live } = await fetchPublicAvis();

  return (
    <div className="min-h-screen bg-gov-slate text-slate-900">
      <header className="border-b border-gov-gold/40 bg-gov-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gov-gold/60 bg-gov-navyLight">
              <Building2 className="h-5 w-5 text-gov-gold" />
            </div>
            <div>
              <h1 className="text-base font-bold">
                SIGAMP-CM · Portail Public des Avis d’Appels d’Offres (AAO)
              </h1>
              <p className="text-xs text-slate-300">
                Accès libre conforme à la transparence CMP Décret 2018/366
                {live ? ' · Flux Supabase en direct' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/verify/a3f9c2b1e8407d6c5a1234567890abcdef1234567890abcdef1234567890abcd"
              className="rounded-xl border border-white/20 px-3 py-2 font-medium text-white hover:bg-white/10"
            >
              Vérifier un document
            </Link>
            <Link
              href="/login"
              className="rounded-xl bg-gov-gold px-3.5 py-2 font-semibold text-gov-navy hover:opacity-90"
            >
              Connexion Agent / Entreprise
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Consultation ouverte des marchés publiés ({rows.length} avis actif(s))
          </p>
          <p className="mt-1 text-emerald-800">
            Les dossiers complets (DAO) et le dépôt électronique des plis chiffrés
            s’effectuent après authentification sur le Portail Soumissionnaire.
          </p>
        </div>

        <div className="space-y-3">
          {rows.map((aao) => (
            <article
              key={aao.dao_number}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="rounded-full bg-gov-navy/10 px-2.5 py-1 text-[11px] font-bold text-gov-navy">
                  {aao.dao_number}
                </span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                  {aao.nature} · {aao.mode}
                </span>
              </div>
              <h2 className="mt-2 text-base font-bold text-gov-navy">{aao.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{aao.entity_name}</p>

              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700 sm:grid-cols-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-gov-navy" />
                  <span>
                    Enveloppe :{' '}
                    <strong>
                      {Number(aao.estimated_amount_ttc).toLocaleString('fr-FR')} FCFA TTC
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gov-navy" />
                  <span>
                    Remise plis :{' '}
                    <strong>
                      {aao.submission_deadline
                        ? new Date(aao.submission_deadline).toLocaleDateString('fr-FR')
                        : 'Selon DAO'}
                    </strong>
                  </span>
                </div>
                <div>
                  Ouverture :{' '}
                  <strong>
                    {aao.opening_datetime
                      ? new Date(aao.opening_datetime).toLocaleDateString('fr-FR')
                      : 'En séance CDPM'}
                  </strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
      <TitCsBrandFooter compact />
    </div>
  );
}
