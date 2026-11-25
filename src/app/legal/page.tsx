import { ArrowLeft, Lock, Scale, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import {
  TitCsBrandFooter,
  TitCsLogo,
} from '../../components/branding/TitCsBrandFooter';

const LEGAL_EDITOR = {
  companyName: 'TIT-CONSULTING SOLUTIONS (TIT-CS)',
  founderName: 'Le Prince Joël NOUBISSIE TCHASSOM (Joël Tchassom)',
  headquarters: "Bafang, Quartier Administratif — Haut-Nkam, Région de l'Ouest, Cameroun",
  phones: '+237 6 95 51 25 28 / +237 682 58 09 45',
  email: 'contact@tit-cs.com',
  website: 'https://tit-cs.netlify.app',
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-gov-slate text-slate-900">
      <header className="border-b border-[#D4AF37]/40 bg-[#0A1F3D] px-4 py-4 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TitCsLogo size={38} />
            <div>
              <h1 className="text-sm font-bold tracking-wide text-white">
                SIGAMP-CM — Cadre Légal, CGU &amp; Protection des Données
              </h1>
              <p className="text-[11px] text-[#D4AF37]">
                {LEGAL_EDITOR.companyName}
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour Connexion
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-xs leading-relaxed text-slate-700">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
            <Scale className="h-4 w-4 text-[#D4AF37]" />
            1. Mentions Légales &amp; Éditeur
          </h2>
          <p className="mt-2">
            La plateforme <strong>SIGAMP-CM</strong> (Système Intégré de Gestion des Actes et des
            Marchés Publics du Cameroun) est éditée par{' '}
            <strong>{LEGAL_EDITOR.companyName}</strong>, fondée par{' '}
            <strong>{LEGAL_EDITOR.founderName}</strong>.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Siège social :</strong> {LEGAL_EDITOR.headquarters}
            </li>
            <li>
              <strong>Téléphones :</strong> {LEGAL_EDITOR.phones}
            </li>
            <li>
              <strong>Messagerie officielle :</strong> {LEGAL_EDITOR.email}
            </li>
            <li>
              <strong>Site institutionnel :</strong> {LEGAL_EDITOR.website}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
            <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />
            2. Conditions Générales d’Utilisation (CGU) &amp; Licences
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              L’accès est strictement réservé aux entités publiques, commissions de passation et
              opérateurs économiques habilités dans le cadre d’une licence active émise par TIT-CS
              (<em>Essai Démo, Mensuelle, Annuelle, Pluriannuelle ou Souveraine</em>).
            </li>
            <li>
              Chaque institution conserve l’entière propriété juridique de ses marchés, actes,
              procès-verbaux et archives déposés dans la GED Régalienne.
            </li>
            <li>
              En cas d’expiration de licence, les archives et pièces scellées demeurent consultables
              en lecture seule afin de préserver la continuité du service public et les contrôles
              réglementaires (ARMP, MINMAP, CONSUPE, Chambre des Comptes).
            </li>
            <li>
              Les calculs automatiques et suggestions du Copilote IA constituent des outils d’aide
              à la décision soumis à la validation humaine des ordonnateurs et commissions compétentes
              conformément au Décret N° 2018/366 du 20 juin 2018.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0A1F3D]">
            <Lock className="h-4 w-4 text-[#D4AF37]" />
            3. Protection des Données, Isolation Multi-Entités &amp; Intégrité
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Étanchéité stricte (RLS PostgreSQL) :</strong> chaque entité publique dispose
              d’un cloisonnement logique vérifié au niveau base de données et applicatif.
            </li>
            <li>
              <strong>Traçabilité &amp; Anticorp-falsification :</strong> les opérations critiques
              sont journalisées de manière immuable (<code className="rounded bg-slate-100 px-1">audit_logs</code>)
              et les documents officiels portent une empreinte cryptographique SHA-256 vérifiable sur{' '}
              <code className="rounded bg-slate-100 px-1">/verify/[sealId]</code>, en conformité avec
              la Loi N° 2010/012 relative à la cybersécurité et la cybercriminalité au Cameroun et la
              Loi N° 2024/017 relative à la protection des données à caractère personnel.
            </li>
            <li>
              <strong>Disponibilité &amp; Continuité :</strong> le mode hors-ligne chiffré dans le
              navigateur (IndexedDB) garantit la continuité de saisie même en zone rurale ou en cas
              de coupure réseau.
            </li>
          </ul>
        </section>
      </main>

      <TitCsBrandFooter />
    </div>
  );
}
