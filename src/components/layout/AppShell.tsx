'use client';

import {
  AlertTriangle,
  Archive,
  Building2,
  CloudOff,
  FileText,
  LogOut,
  Palette,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  pruneClosedRecordsFromLocalCache,
  useOfflineSyncStatus,
} from '../../lib/offline/offlineStore';
import {
  getSupabaseBrowserClient,
  isDemoRoleSwitcherEnabled,
  loadAuthenticatedUserProfiles,
  setAuthSessionCookie,
} from '../../lib/supabase/client';
import {
  ROLE_PROFILES,
  type ActiveRoleProfile,
  type WorkspaceSpaceId,
} from '../../lib/ui/demoProfiles';
import { GlobalAiCommandBar } from '../ai/GlobalAiCommandBar';
import { TitCsBrandFooter } from '../branding/TitCsBrandFooter';
import {
  AdminStudioWorkspace,
  type StudioPublishedPayload,
} from '../workspaces/AdminStudioWorkspace';
import { DocumentFactoryWorkspace } from '../workspaces/DocumentFactoryWorkspace';
import { GedArchiveWorkspace } from '../workspaces/GedArchiveWorkspace';

type OverlayWorkspaceMode = 'NONE' | 'GED' | 'FACTORY' | 'STUDIO';

interface AppShellProps {
  activeSpace: WorkspaceSpaceId;
  onSelectSpace: (space: WorkspaceSpaceId) => void;
  children: (ctx: {
    profile: ActiveRoleProfile;
    isOnline: boolean;
    triggerSync: () => Promise<unknown>;
  }) => ReactNode;
}

export function AppShell({ activeSpace, onSelectSpace, children }: AppShellProps) {
  const router = useRouter();
  const [aiOpen, setAiOpen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayWorkspaceMode>('NONE');
  const [studioOverride, setStudioOverride] = useState<StudioPublishedPayload | null>(null);
  const sync = useOfflineSyncStatus();
  const demoMode = isDemoRoleSwitcherEnabled();

  const [authLoading, setAuthLoading] = useState(!demoMode);
  const [realProfiles, setRealProfiles] = useState<ActiveRoleProfile[]>([]);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [pruneMessage, setPruneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) return;
    let cancelled = false;

    const initAuth = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        router.replace('/login');
        return;
      }

      const loaded = await loadAuthenticatedUserProfiles(supabase);
      if (cancelled) return;

      if (!loaded) {
        setAuthSessionCookie(null);
        router.replace('/login');
        return;
      }

      setAuthSessionCookie(loaded.accessToken);
      setAuthEmail(loaded.email);
      setRealProfiles(loaded.profiles);
      if (loaded.profiles.length > 0) {
        const hasCurrent = loaded.profiles.some((p) => p.spaceId === activeSpace);
        if (!hasCurrent) {
          onSelectSpace(loaded.profiles[0]!.spaceId);
        }
      }
      setAuthLoading(false);
    };

    void initAuth();
    return () => {
      cancelled = true;
    };
  }, [demoMode, router, activeSpace, onSelectSpace]);

  const availableProfiles = demoMode ? ROLE_PROFILES : realProfiles;
  const baseProfile =
    availableProfiles.find((p) => p.spaceId === activeSpace) ??
    availableProfiles[0] ??
    ROLE_PROFILES[0]!;

  const activeProfile: ActiveRoleProfile =
    studioOverride && studioOverride.identity.entityId === baseProfile.entityId
      ? {
          ...baseProfile,
          entityName: studioOverride.identity.entityName,
          primaryColor: studioOverride.identity.primaryColor,
          accentColor: studioOverride.identity.accentColor,
          logoUrl: studioOverride.identity.logoUrl,
          logoSvg: studioOverride.identity.logoSvg,
        }
      : baseProfile;

  const canAccessStudio =
    demoMode ||
    Boolean(activeProfile.isPlatformSuperAdmin) ||
    Boolean(activeProfile.isEntityAdmin) ||
    ['SIGAMP', 'MO_MOD', 'SUPER_ADMIN', 'ADMIN_ENTITE'].includes(activeProfile.roleCode);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAiOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthSessionCookie(null);
    router.replace('/login');
  };

  const handlePruneCache = async () => {
    const result = await pruneClosedRecordsFromLocalCache(undefined, 30);
    setPruneMessage(
      `Cache purgé : ${result.prunedCount} clos supprimés (${result.skippedPendingCount} en attente préservés).`
    );
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gov-slate text-sm text-gov-navy">
        Vérification de la session Supabase Auth & des habilitations RBAC...
      </div>
    );
  }

  if (!demoMode && availableProfiles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gov-slate px-4 text-center">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-md">
          <h1 className="text-base font-bold text-rose-800">
            Aucune affectation active (entity_memberships)
          </h1>
          <p className="mt-2 text-xs text-slate-600">
            Le compte <strong>{authEmail ?? 'connecté'}</strong> ne possède aucun
            rôle actif sur cette entité publique. Contactez votre administrateur SIGAMP.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gov-navy px-4 py-2 text-xs font-semibold text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const totalPending = sync.pendingMutationsCount + sync.pendingAttachmentsCount;
  const headerBgStyle = activeProfile.primaryColor
    ? { backgroundColor: activeProfile.primaryColor }
    : undefined;

  return (
    <div className="flex min-h-screen flex-col bg-gov-slate text-slate-900">
      {/* Bandeau Républicain & Etat Réseau / Sync */}
      <header
        style={headerBgStyle}
        className="sticky top-0 z-30 border-b border-gov-gold/40 bg-gov-navy text-white shadow-md"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-gov-gold/60 bg-gov-navyLight">
              {activeProfile.logoUrl ? (
                <img
                  src={activeProfile.logoUrl}
                  alt={activeProfile.entityCode}
                  className="h-full w-full bg-white object-contain p-0.5"
                />
              ) : activeProfile.logoSvg ? (
                <span
                  className="flex h-full w-full items-center justify-center bg-white p-0.5 [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: activeProfile.logoSvg }}
                />
              ) : (
                <Building2 className="h-5 w-5 text-gov-gold" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold tracking-wide text-white">
                  SIGAMP-CM
                </span>
                <span className="rounded bg-gov-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gov-gold">
                  CMP 2018/366 · V3.0 Élargie
                </span>
                {demoMode && (
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                    MODE DÉMO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                {activeProfile.entityName} ({activeProfile.entityCode}) — Exercice{' '}
                {activeProfile.fiscalYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOverlayMode((m) => (m === 'GED' ? 'NONE' : 'GED'))}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                overlayMode === 'GED'
                  ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                  : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Archive className="h-3.5 w-3.5" />
              <span>GED Régalienne</span>
            </button>

            <button
              type="button"
              onClick={() => setOverlayMode((m) => (m === 'FACTORY' ? 'NONE' : 'FACTORY'))}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                overlayMode === 'FACTORY'
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A1F3D]'
                  : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-gov-gold" />
              <span>44 Actes &amp; DTAO / DC</span>
            </button>

            {canAccessStudio && (
              <button
                type="button"
                onClick={() => setOverlayMode((m) => (m === 'STUDIO' ? 'NONE' : 'STUDIO'))}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  overlayMode === 'STUDIO'
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A1F3D]'
                    : 'border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37]/25'
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                <span>{overlayMode === 'STUDIO' ? 'Retour Espace Métier' : 'Studio & CMS V3.0'}</span>
              </button>
            )}

            {/* Bouton Copilote IA Ctrl+K */}
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <Search className="h-3.5 w-3.5 text-gov-gold" />
              <span>Copilote IA</span>
              <kbd className="hidden rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-200 sm:inline">
                Ctrl+K
              </kbd>
            </button>

            {/* Indicateur Temps Réel Etat Réseau & Sync */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-black/20 px-2.5 py-1.5 text-xs">
              {sync.isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span className="font-medium">
                {sync.syncState === 'SYNCING'
                  ? 'Synchro...'
                  : sync.isOnline
                    ? 'En ligne'
                    : 'Hors-ligne'}
              </span>
              {totalPending > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  {totalPending} en file
                </span>
              )}
              {sync.conflictCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
                  title="Conflit de synchronisation à arbitrer"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {sync.conflictCount}
                </span>
              )}
              <button
                type="button"
                onClick={() => void sync.triggerSync()}
                disabled={!sync.isOnline || sync.syncState === 'SYNCING'}
                className="ml-1 rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
                title="Forcer la synchronisation bidirectionnelle Supabase"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    sync.syncState === 'SYNCING' ? 'animate-spin' : ''
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => void handlePruneCache()}
                className="rounded p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                title="Purger les dossiers clos synchronisés > 30 jours du cache local"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={sync.toggleSimulatedOffline}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                  sync.simulatedOffline
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                title="Simuler un travail terrain sans connexion Internet"
              >
                <CloudOff className="mr-1 inline h-3 w-3" />
                {sync.simulatedOffline ? 'Terrain ON' : 'Simuler Offline'}
              </button>
            </div>

            {!demoMode && (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 py-2 text-xs font-medium text-white hover:bg-white/20"
                title="Se déconnecter"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            )}
          </div>
        </div>

        {/* Sélecteur d'Espace RBAC (complet en démo, restreint aux habilitations réelles en prod) */}
        <div className="border-t border-white/10 bg-gov-navyLight/60">
          <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6">
            <span className="mr-2 hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gov-gold lg:inline-flex">
              <Shield className="h-3.5 w-3.5" />
              {demoMode ? 'Espace RBAC (Démo) :' : 'Vos habilitations :'}
            </span>
            {availableProfiles.map((p) => {
              const active = overlayMode === 'NONE' && p.spaceId === activeProfile.spaceId;
              return (
                <button
                  key={`${p.spaceId}-${p.roleCode}`}
                  type="button"
                  onClick={() => {
                    setOverlayMode('NONE');
                    onSelectSpace(p.spaceId);
                  }}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'bg-gov-gold text-gov-navy shadow-sm'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {p.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Bandeau Licence Expirée / Restreinte si applicable */}
      {(activeProfile.licenseStatus === 'EXPIREE' ||
        activeProfile.licenseStatus === 'SUSPENDUE') && (
        <div className="border-b border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-900">
          <div className="mx-auto flex max-w-7xl items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-700" />
            <span>
              Licence {activeProfile.licenseStatus} pour {activeProfile.entityName} : la
              consultation des archives reste autorisée, mais la création de nouveaux actes
              est bloquée jusqu’au renouvellement auprès de TIT-CS.
            </span>
          </div>
        </div>
      )}

      {/* Bandeau Profil Actif */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-slate-600 sm:px-6">
          <div>
            <span className="font-semibold text-gov-navy">
              {overlayMode === 'STUDIO'
                ? 'Studio CMS & Double Gouvernance (V3.0)'
                : overlayMode === 'GED'
                  ? 'GED Régalienne & Coffre-Fort Numérique (6 Chemises)'
                  : overlayMode === 'FACTORY'
                    ? 'Usine Documentaire V3.0 (44 Actes, DTAO Intégral & Demande de Cotation)'
                    : activeProfile.label}
            </span>
            <span className="mx-2 text-slate-300">|</span>
            <span>
              Connecté : <strong>{activeProfile.fullName}</strong> ({activeProfile.roleCode})
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            {pruneMessage ? (
              <span className="font-medium text-emerald-700">{pruneMessage}</span>
            ) : (
              activeProfile.description
            )}
            {sync.lastSyncedAt && (
              <span className="ml-2 text-emerald-700">
                · Dernière synchro : {new Date(sync.lastSyncedAt).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contenu principal de l'espace */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {overlayMode === 'STUDIO' ? (
          <AdminStudioWorkspace
            profile={activeProfile}
            onStudioPublished={(pub) => setStudioOverride(pub)}
          />
        ) : overlayMode === 'GED' ? (
          <GedArchiveWorkspace profile={activeProfile} />
        ) : overlayMode === 'FACTORY' ? (
          <DocumentFactoryWorkspace profile={activeProfile} />
        ) : (
          children({
            profile: activeProfile,
            isOnline: sync.isOnline,
            triggerSync: sync.triggerSync,
          })
        )}
      </main>

      <TitCsBrandFooter />

      {/* Barre de Commande IA Ctrl+K */}
      <GlobalAiCommandBar
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        profile={activeProfile}
        isOnline={sync.isOnline}
      />
    </div>
  );
}
