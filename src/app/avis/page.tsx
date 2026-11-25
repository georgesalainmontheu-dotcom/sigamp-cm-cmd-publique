import { Building2, Calendar, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const PUBLIC_AAO_LIST = [
  {
    reference: 'AAO N° 014/AONO/C-BAF/CDPM/2026',
    title: 'Construction de 03 salles de classe équipées à l’école publique de Bafang Centre',
    entity: 'Commune de Bafang (Région de l’Ouest)',
    nature: 'TRAVAUX · Lettre-Commande',
    amountEst: '48 500 000 FCFA TTC',
    closingDate: '12 décembre 2026 à 13h00',
    bidBond: '970 000 FCFA (Caution bancaire / COBAC)',
  },
  {
    reference: 'AAO N° 018/AONO/CUY/CIPM/2026',
    title: 'Fourniture et installation de lampadaires solaires autonomes — Voirie Lot 2',
    entity: 'Communauté Urbaine de Yaoundé',
    nature: 'FOURNITURES · Marché Public',
    amountEst: '185 000 000 FCFA TTC',
    closingDate: '19 décembre 2026 à 12h00',
    bidBond: '3 700 000 FCFA',
  },
  {
    reference: 'ASMI N° 006/ASMI/CR-OU/CRPM/2026',
    title: 'Maîtrise d’œuvre et contrôle technique de réhabilitation de pistes rurales',
    entity: 'Conseil Régional de l’Ouest',
    nature: 'PRESTATIONS INTELLECTUELLES',
    amountEst: '62 000 000 FCFA TTC',
    closingDate: '22 décembre 2026 à 14h00',
    bidBond: 'Non requise (phase préqualification ASMI)',
  },
];

export default function PublicAvisPage() {
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
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/verify/SIGAMP-SEAL-DEMO"
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
            Consultation ouverte des marchés en cours de publication
          </p>
          <p className="mt-1 text-emerald-800">
            Les dossiers complets (DAO) et le dépôt électronique des plis chiffrés
            s’effectuent après authentification sur le Portail Soumissionnaire.
          </p>
        </div>

        <div className="space-y-3">
          {PUBLIC_AAO_LIST.map((aao) => (
            <article
              key={aao.reference}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="rounded-full bg-gov-navy/10 px-2.5 py-1 text-[11px] font-bold text-gov-navy">
                  {aao.reference}
                </span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                  {aao.nature}
                </span>
              </div>
              <h2 className="mt-2 text-base font-bold text-gov-navy">{aao.title}</h2>
              <p className="mt-1 text-xs text-slate-600">{aao.entity}</p>

              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-700 sm:grid-cols-3">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-gov-navy" />
                  <span>
                    Enveloppe : <strong>{aao.amountEst}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gov-navy" />
                  <span>
                    Remise plis : <strong>{aao.closingDate}</strong>
                  </span>
                </div>
                <div>
                  Caution soumission : <strong>{aao.bidBond}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
