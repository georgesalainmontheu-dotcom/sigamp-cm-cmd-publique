'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildAuthenticatedJsonHeaders } from '../supabase/client';

export type PersistedWorkspaceKey =
  | 'CPM_SCA'
  | 'FINANCE_CF'
  | 'SOUMISSIONNAIRE'
  | 'CONTENTIEUX';

export function useWorkspacePersistence<T extends Record<string, unknown>>(
  entityId: string,
  spaceKey: PersistedWorkspaceKey
) {
  const [loadedState, setLoadedState] = useState<Partial<T> | null>(null);
  const [openTenders, setOpenTenders] = useState<
    Array<{
      id: string;
      code: string;
      title: string;
      nature: string;
      mode: string;
      estimated_amount_ttc: number;
      status: string;
    }>
  >([]);
  const [syncBadge, setSyncBadge] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const headers = await buildAuthenticatedJsonHeaders();
        const res = await fetch(
          `/api/workspaces/state?entityId=${encodeURIComponent(entityId)}&spaceKey=${spaceKey}`,
          { headers }
        );
        if (!res.ok || !active) return;
        const json = (await res.json()) as {
          state?: Partial<T> | null;
          updatedAt?: string | null;
          openTenders?: typeof openTenders;
        };
        if (json.state && active) {
          setLoadedState(json.state);
        }
        if (Array.isArray(json.openTenders) && active) {
          setOpenTenders(json.openTenders);
        }
        if (json.updatedAt && active) {
          setSyncBadge(
            `Chargé depuis Supabase (${new Date(json.updatedAt).toLocaleTimeString('fr-FR')})`
          );
        }
      } catch {
        // Fallback silencieux sur l'état local / hors-ligne
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [entityId, spaceKey]);

  const persistState = useCallback(
    async (state: T, actionLabel?: string) => {
      setIsSaving(true);
      try {
        const headers = await buildAuthenticatedJsonHeaders();
        const res = await fetch('/api/workspaces/state', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            entityId,
            spaceKey,
            state,
            actionLabel,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { updatedAt?: string };
          setSyncBadge(
            `Sauvegardé Supabase (${new Date(json.updatedAt ?? Date.now()).toLocaleTimeString('fr-FR')})`
          );
        }
      } finally {
        setIsSaving(false);
      }
    },
    [entityId, spaceKey]
  );

  return {
    loadedState,
    openTenders,
    syncBadge,
    isSaving,
    persistState,
  };
}
