'use client';

import {
  AlertTriangle,
  Building2,
  CloudOff,
  RefreshCw,
  Search,
  Shield,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useOfflineSyncStatus } from '../../lib/offline/offlineStore';
import {
  ROLE_PROFILES,
  type ActiveRoleProfile,
  type WorkspaceSpaceId,
} from '../../lib/ui/demoProfiles';
import { GlobalAiCommandBar } from '../ai/GlobalAiCommandBar';

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
  const [aiOpen, setAiOpen] = useState(false);
  const sync = useOfflineSyncStatus();

  const activeProfile =
    ROLE_PROFILES.find((p) => p.spaceId === activeSpace) ?? ROLE_PROFILES[0]!;

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

  const totalPending = sync.pendingMutationsCount + sync.pendingAttachmentsCount;

  return (
    <div className="min-h-screen bg-gov-slate text-slate-900">
      {/* Bandeau Républicain & Etat Réseau / Sync */}
      <header className="sticky top-0 z-30 border-b border-gov-gold/40 bg-gov-navy text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gov-gold/60 bg-gov-navyLight">
              <Building2 className="h-5 w-5 text-gov-gold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-wide text-white">
                  SIGAMP-CM
                </span>
                <span className="rounded bg-gov-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gov-gold">
                  CMP 2018/366 · PWA Local-First
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {activeProfile.entityName} ({activeProfile.entityCode}) — Exercice{' '}
                {activeProfile.fiscalYear}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Bouton Copilote IA Ctrl+K */}
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <Search className="h-3.5 w-3.5 text-gov-gold" />
              <span>Copilote IA / Dictée</span>
              <kbd className="hidden rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-slate-200 sm:inline">
                Ctrl+K
              </kbd>
            </button>

            {/* Indicateur Temps Réel Etat Réseau & Sync */}
            <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/20 px-3 py-1.5 text-xs">
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
                onClick={sync.toggleSimulatedOffline}
                className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                  sync.simulatedOffline
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
                title="Simuler un travail terrain sans connexion Internet"
              >
                <CloudOff className="mr-1 inline h-3 w-3" />
                {sync.simulatedOffline ? 'Mode Terrain ON' : 'Simuler Offline'}
              </button>
            </div>
          </div>
        </div>

        {/* Sélecteur d'Espace RBAC */}
        <div className="border-t border-white/10 bg-gov-navyLight/60">
          <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 py-2 sm:px-6">
            <span className="mr-2 hidden items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gov-gold lg:inline-flex">
              <Shield className="h-3.5 w-3.5" />
              Espace RBAC :
            </span>
            {ROLE_PROFILES.map((p) => {
              const active = p.spaceId === activeSpace;
              return (
                <button
                  key={p.spaceId}
                  type="button"
                  onClick={() => onSelectSpace(p.spaceId)}
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

      {/* Bandeau Profil Actif */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs text-slate-600 sm:px-6">
          <div>
            <span className="font-semibold text-gov-navy">{activeProfile.label}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span>
              Connecté : <strong>{activeProfile.fullName}</strong> ({activeProfile.roleCode})
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            {activeProfile.description}
            {sync.lastSyncedAt && (
              <span className="ml-2 text-emerald-700">
                · Dernière synchro : {new Date(sync.lastSyncedAt).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Contenu principal de l'espace */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {children({
          profile: activeProfile,
          isOnline: sync.isOnline,
          triggerSync: sync.triggerSync,
        })}
      </main>

      <GlobalAiCommandBar
        profile={activeProfile}
        isOnline={sync.isOnline}
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
      />
    </div>
  );
}
