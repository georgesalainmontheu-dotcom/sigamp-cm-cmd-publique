'use client';

import {
  Building2,
  ExternalLink,
  Lock,
  LogIn,
  Search,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { TitCsBrandFooter, TitCsLogo } from '../../components/branding/TitCsBrandFooter';
import {
  getSupabaseBrowserClient,
  isDemoRoleSwitcherEnabled,
  listLoginEntities,
  setAuthSessionCookie,
  setSelectedEntityCookie,
  verifyEntityLoginAccess,
  type LoginEntityDirectoryItem,
} from '../../lib/supabase/client';

const FALLBACK_ENTITIES: LoginEntityDirectoryItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'CM-OU-BAF',
    name: 'Commune de Bafang',
    type: 'COMMUNE',
    municipality: 'Bafang',
    primary_color: '#0A1F3D',
    accent_color: '#D4AF37',
    license_status: 'ACTIVE',
    license_plan_code: 'ANNUELLE',
    license_expires_at: '2027-12-31T23:59:59Z',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [entities, setEntities] = useState<LoginEntityDirectoryItem[]>(FALLBACK_ENTITIES);
  const [entitySearch, setEntitySearch] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>(
    FALLBACK_ENTITIES[0]!.id
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoAllowed = isDemoRoleSwitcherEnabled();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void listLoginEntities(supabase).then((rows) => {
      if (rows.length > 0) {
        setEntities(rows);
        setSelectedEntityId(rows[0]!.id);
      }
    });
  }, []);

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.municipality ?? '').toLowerCase().includes(q)
    );
  }, [entities, entitySearch]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === selectedEntityId) ?? entities[0]!,
    [entities, selectedEntityId]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError('Configuration Supabase manquante sur cet environnement.');
        return;
      }

      const rawIdentifier = email.trim().toLowerCase();
      const resolvedEmail =
        rawIdentifier === 'jolotus' ? 'jolotus@tit-cs.cm' : rawIdentifier;

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (signInError || !data.session) {
        setError(
          signInError?.message ??
            'Identifiants invalides. Vérifiez votre compte SIGAMP-CM.'
        );
        return;
      }

      // Vérification stricte de rattachement à l'entité, statut is_active et validité de licence
      if (selectedEntityId) {
        const access = await verifyEntityLoginAccess(supabase, selectedEntityId);
        if (access && !access.allowed) {
          await supabase.auth.signOut();
          setAuthSessionCookie(null);
          setSelectedEntityCookie(null);
          setError(`Accès refusé pour ${selectedEntity.name} : ${access.reason}`);
          return;
        }
        setSelectedEntityCookie(selectedEntityId);
      }

      setAuthSessionCookie(data.session.access_token);
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirectTo') || '/';
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de la connexion.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-gov-slate">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <TitCsLogo size={46} />
            <div>
              <h1 className="text-lg font-bold text-gov-navy">
                SIGAMP-CM · Connexion Entité
              </h1>
              <p className="text-xs text-slate-500">
                Commande Publique · Décret 2018/366 &amp; Multi-Entités V2.1
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              Authentification liée à l’entité publique &amp; licence
            </p>
            <p className="mt-1 text-[11px] text-emerald-800">
              Sélectionnez votre institution puis connectez-vous. La plateforme vérifie votre
              affectation active, l’activation de votre login et la licence de l’entité.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
              {error}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
            {/* Sélecteur d'entité publique avec recherche */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-gov-navy" />
                  Entité / Institution Publique
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    selectedEntity.license_status === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  Licence {selectedEntity.license_status}
                </span>
              </label>

              {entities.length > 3 && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Rechercher une commune, ministère, EPA..."
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs outline-none focus:border-gov-navy"
                  />
                </div>
              )}

              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-gov-navy outline-none focus:border-gov-navy"
              >
                {filteredEntities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.code} — {ent.name} ({ent.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                Identifiant ou adresse e-mail professionnelle
              </label>
              <input
                id="email"
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jolotus ou agent@commune-bafang.cm"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gov-navy"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-xs font-semibold text-slate-700"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-gov-navy"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gov-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gov-navyLight disabled:opacity-50"
            >
              <LogIn className="h-4 w-4 text-gov-gold" />
              {loading ? 'Vérification & connexion...' : `Accéder à ${selectedEntity.code}`}
            </button>
          </form>

          {demoAllowed && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Mode Démonstration activé (environnement local)</p>
              <Link
                href="/"
                className="mt-1 inline-flex items-center gap-1 font-semibold text-gov-navy underline"
              >
                Accéder directement à l’espace de démonstration
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-600">
            <p className="mb-2 flex items-center gap-1 font-semibold text-slate-700">
              <Lock className="h-3.5 w-3.5 text-gov-navy" />
              Portails publics sans authentification :
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/avis"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-gov-navy hover:bg-slate-100"
              >
                Consulter les Avis (AAO)
              </Link>
              <Link
                href="/verify/SIGAMP-SEAL-DEMO"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-gov-navy hover:bg-slate-100"
              >
                Vérifier un Scellé QR / SHA-256
              </Link>
              <Link
                href="/legal"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-gov-navy hover:bg-slate-100"
              >
                Mentions Légales &amp; CGU
              </Link>
            </div>
          </div>
        </div>
      </div>

      <TitCsBrandFooter compact />
    </div>
  );
}
