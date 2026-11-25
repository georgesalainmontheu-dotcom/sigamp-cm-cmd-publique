'use client';

import { Building2, ExternalLink, Lock, LogIn, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  getSupabaseBrowserClient,
  isDemoRoleSwitcherEnabled,
  setAuthSessionCookie,
} from '../../lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demoAllowed = isDemoRoleSwitcherEnabled();

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

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data.session) {
        setError(
          signInError?.message ??
            'Identifiants invalides. Vérifiez votre compte SIGAMP-CM.'
        );
        return;
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gov-slate px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gov-navy text-gov-gold shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gov-navy">
              SIGAMP-CM · Authentification
            </h1>
            <p className="text-xs text-slate-500">
              République du Cameroun · Commande Publique (Décret 2018/366)
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            Accès RBAC sécurisé par Supabase Auth & RLS
          </p>
          <p className="mt-1 text-[11px] text-emerald-800">
            Votre rôle (SIGAMP, MO, CPM, SCA, Contrôleur Financier, Soumissionnaire)
            est chargé automatiquement depuis vos affectations actives.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs font-semibold text-slate-700"
            >
              Adresse e-mail professionnelle
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@commune-bafang.cm"
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
            {loading ? 'Connexion en cours...' : 'Se connecter à SIGAMP-CM'}
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
          </div>
        </div>
      </div>
    </div>
  );
}
