'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie, { type Table } from 'dexie';
import { useCallback, useEffect, useState } from 'react';

/**
 * Moteur Local-First & Synchronisation Bidirectionnelle Offline (Jalon 4)
 * - Stockage IndexedDB via Dexie.js aligné sur les tables Supabase (Jalon 1)
 * - File d'attente causale des mutations hors-ligne (mutationQueue)
 * - Compression client-side des pièces scannées avant upload Supabase Storage
 * - Synchronisation bidirectionnelle Push/Pull avec protection anti-écrasement & gestion de conflits
 */

export type OfflineEntityTable =
  | 'projects'
  | 'tender_files'
  | 'bids'
  | 'sca_evaluations'
  | 'contracts'
  | 'decomptes'
  | 'amendments'
  | 'indemnity_scales'
  | 'session_attendances'
  | 'indemnity_liquidations'
  | 'disputes'
  | 'generated_correspondences'
  | 'audit_logs';

export type MutationOperation = 'INSERT' | 'UPDATE' | 'DELETE';
export type MutationStatus = 'PENDING' | 'SYNCING' | 'CONFLICT' | 'FAILED';

export interface OfflineRecordBase {
  id: string;
  entity_id?: string;
  sync_version?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface OfflineMutationItem {
  id?: number;
  tableName: OfflineEntityTable;
  recordId: string;
  operation: MutationOperation;
  payload: Record<string, unknown>;
  expectedSyncVersion: number;
  status: MutationStatus;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScannedAttachmentRecord {
  id: string;
  entityId: string;
  relatedTable: OfflineEntityTable;
  relatedRecordId: string;
  fileName: string;
  mimeType: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number;
  sha256: string;
  dataBase64: string;
  storagePath?: string;
  uploadStatus: 'PENDING_UPLOAD' | 'UPLOADED' | 'FAILED';
  createdAt: string;
}

export interface SyncMetadataRecord {
  tableName: string;
  lastPulledAt: string;
  lastPushAt?: string;
}

export type SyncState = 'IDLE' | 'SYNCING' | 'OFFLINE' | 'CONFLICT' | 'ERROR';

export interface SyncStatusSnapshot {
  isOnline: boolean;
  simulatedOffline: boolean;
  syncState: SyncState;
  pendingMutationsCount: number;
  pendingAttachmentsCount: number;
  conflictCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export class CommandePubliqueOfflineDB extends Dexie {
  projects!: Table<OfflineRecordBase, string>;
  tender_files!: Table<OfflineRecordBase, string>;
  bids!: Table<OfflineRecordBase, string>;
  sca_evaluations!: Table<OfflineRecordBase, string>;
  contracts!: Table<OfflineRecordBase, string>;
  decomptes!: Table<OfflineRecordBase, string>;
  amendments!: Table<OfflineRecordBase, string>;
  indemnity_scales!: Table<OfflineRecordBase, string>;
  session_attendances!: Table<OfflineRecordBase, string>;
  indemnity_liquidations!: Table<OfflineRecordBase, string>;
  disputes!: Table<OfflineRecordBase, string>;
  generated_correspondences!: Table<OfflineRecordBase, string>;
  audit_logs!: Table<OfflineRecordBase, string>;
  mutationQueue!: Table<OfflineMutationItem, number>;
  scannedAttachments!: Table<ScannedAttachmentRecord, string>;
  syncMetadata!: Table<SyncMetadataRecord, string>;

  constructor(dbName = 'commande_publique_cm_offline_v1') {
    super(dbName);
    this.version(1).stores({
      projects: 'id, entity_id, updated_at',
      tender_files: 'id, entity_id, updated_at',
      bids: 'id, entity_id, updated_at',
      sca_evaluations: 'id, entity_id, updated_at',
      contracts: 'id, entity_id, updated_at',
      decomptes: 'id, entity_id, updated_at',
      amendments: 'id, entity_id, updated_at',
      indemnity_scales: 'id, entity_id, updated_at',
      session_attendances: 'id, entity_id, updated_at',
      indemnity_liquidations: 'id, entity_id, updated_at',
      disputes: 'id, entity_id, updated_at',
      generated_correspondences: 'id, entity_id, updated_at',
      audit_logs: 'id, entity_id, updated_at',
      mutationQueue: '++id, tableName, recordId, status, createdAt',
      scannedAttachments: 'id, entityId, relatedTable, relatedRecordId, uploadStatus',
      syncMetadata: 'tableName',
    });
  }

  getEntityTable(tableName: OfflineEntityTable): Table<OfflineRecordBase, string> {
    return this[tableName] as Table<OfflineRecordBase, string>;
  }
}

let singletonDb: CommandePubliqueOfflineDB | null = null;

export function getOfflineDb(): CommandePubliqueOfflineDB {
  if (!singletonDb) {
    singletonDb = new CommandePubliqueOfflineDB();
  }
  return singletonDb;
}

// ============================================================================
// UTILITAIRES CRYPTO & COMPRESSION CLIENT-SIDE DES PIECES SCANNÉES
// ============================================================================

export async function computeSha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', normalized.buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('Web Crypto API indisponible pour calculer le SHA-256.');
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface CompressScanOptions {
  entityId: string;
  relatedTable: OfflineEntityTable;
  relatedRecordId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  maxDimensionPx?: number;
  jpegQuality?: number;
}

export async function compressScannedDocumentClientSide(
  opts: CompressScanOptions
): Promise<ScannedAttachmentRecord> {
  const originalSizeBytes = opts.bytes.byteLength;
  let finalBytes = opts.bytes;
  let finalMime = opts.mimeType || 'application/octet-stream';

  const isCompressibleImage =
    finalMime === 'image/jpeg' ||
    finalMime === 'image/png' ||
    finalMime === 'image/webp';

  // Compression via OffscreenCanvas / createImageBitmap dans le navigateur
  if (
    isCompressibleImage &&
    typeof createImageBitmap === 'function' &&
    typeof OffscreenCanvas !== 'undefined'
  ) {
    try {
      const normalized = new Uint8Array(opts.bytes.byteLength);
      normalized.set(opts.bytes);
      const blob = new Blob([normalized.buffer], { type: finalMime });
      const bitmap = await createImageBitmap(blob);
      const maxDim = opts.maxDimensionPx ?? 1600;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const targetW = Math.max(1, Math.round(bitmap.width * scale));
      const targetH = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = new OffscreenCanvas(targetW, targetH);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        const compressedBlob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: opts.jpegQuality ?? 0.72,
        });
        const compressedBuffer = await compressedBlob.arrayBuffer();
        const candidate = new Uint8Array(compressedBuffer);
        if (candidate.byteLength < originalSizeBytes) {
          finalBytes = candidate;
          finalMime = 'image/jpeg';
        }
      }
      bitmap.close();
    } catch {
      // Fallback propre : on conserve les octets d'origine si l'API Canvas échoue
    }
  }

  const sha256 = await computeSha256Hex(finalBytes);
  const compressedSizeBytes = finalBytes.byteLength;
  const compressionRatio =
    originalSizeBytes > 0
      ? Number((compressedSizeBytes / originalSizeBytes).toFixed(4))
      : 1;

  const record: ScannedAttachmentRecord = {
    id:
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `att-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    entityId: opts.entityId,
    relatedTable: opts.relatedTable,
    relatedRecordId: opts.relatedRecordId,
    fileName: opts.fileName,
    mimeType: finalMime,
    originalSizeBytes,
    compressedSizeBytes,
    compressionRatio,
    sha256,
    dataBase64: uint8ToBase64(finalBytes),
    uploadStatus: 'PENDING_UPLOAD',
    createdAt: new Date().toISOString(),
  };

  return record;
}

// ============================================================================
// OPERATIONS LOCAL-FIRST (ECRITURE IMMEDIATE + MISE EN FILE HORS-LIGNE)
// ============================================================================

export async function saveOfflineRecord<T extends OfflineRecordBase>(
  db: CommandePubliqueOfflineDB,
  tableName: OfflineEntityTable,
  record: T,
  operation: MutationOperation = 'INSERT'
): Promise<T & { sync_version: number; updated_at: string }> {
  const nowIso = new Date().toISOString();
  const nextSyncVersion = (record.sync_version ?? 0) + 1;
  const enriched = {
    ...record,
    sync_version: nextSyncVersion,
    updated_at: nowIso,
  };

  await db.transaction('rw', db.getEntityTable(tableName), db.mutationQueue, async () => {
    if (operation === 'DELETE') {
      await db.getEntityTable(tableName).delete(enriched.id);
    } else {
      await db.getEntityTable(tableName).put(enriched);
    }

    await db.mutationQueue.add({
      tableName,
      recordId: enriched.id,
      operation,
      payload: enriched,
      expectedSyncVersion: record.sync_version ?? 0,
      status: 'PENDING',
      retryCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  await notifyStatusListeners(db);
  return enriched;
}

export async function queueScannedAttachment(
  db: CommandePubliqueOfflineDB,
  opts: CompressScanOptions
): Promise<ScannedAttachmentRecord> {
  const compressed = await compressScannedDocumentClientSide(opts);
  await db.scannedAttachments.put(compressed);
  await notifyStatusListeners(db);
  return compressed;
}

// ============================================================================
// TRANSPORT SUPABASE & SYNCHRONISATION BIDIRECTIONNELLE
// ============================================================================

export interface RemoteSyncTransport {
  pushMutation(mutation: OfflineMutationItem): Promise<{
    ok: boolean;
    conflict?: boolean;
    serverRecord?: OfflineRecordBase;
    errorMessage?: string;
  }>;
  uploadAttachment(attachment: ScannedAttachmentRecord): Promise<{
    ok: boolean;
    storagePath?: string;
    errorMessage?: string;
  }>;
  pullUpdatedSince(
    tableName: OfflineEntityTable,
    sinceIso: string | null
  ): Promise<OfflineRecordBase[]>;
}

export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function createSupabaseSyncTransport(client: SupabaseClient): RemoteSyncTransport {
  return {
    async pushMutation(mutation) {
      try {
        if (mutation.operation === 'DELETE') {
          const { error } = await client
            .from(mutation.tableName)
            .delete()
            .eq('id', mutation.recordId);
          if (error) return { ok: false, errorMessage: error.message };
          return { ok: true };
        }

        if (mutation.operation === 'INSERT') {
          const { data, error } = await client
            .from(mutation.tableName)
            .upsert(mutation.payload, { onConflict: 'id' })
            .select()
            .single();
          if (error) {
            return { ok: false, errorMessage: error.message };
          }
          return { ok: true, serverRecord: data as OfflineRecordBase };
        }

        // UPDATE avec vérification optimiste de sync_version si fournie
        const { data: existing } = await client
          .from(mutation.tableName)
          .select('id, sync_version')
          .eq('id', mutation.recordId)
          .maybeSingle();

        if (
          existing &&
          typeof existing.sync_version === 'number' &&
          existing.sync_version > mutation.expectedSyncVersion
        ) {
          return {
            ok: false,
            conflict: true,
            errorMessage: `Conflit de version sur ${mutation.tableName}/${mutation.recordId} (serveur v${existing.sync_version} > local v${mutation.expectedSyncVersion}).`,
          };
        }

        const { data, error } = await client
          .from(mutation.tableName)
          .update(mutation.payload)
          .eq('id', mutation.recordId)
          .select()
          .single();
        if (error) return { ok: false, errorMessage: error.message };
        return { ok: true, serverRecord: data as OfflineRecordBase };
      } catch (err) {
        return {
          ok: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async uploadAttachment(attachment) {
      try {
        const storagePath = `${attachment.entityId}/${attachment.relatedTable}/${attachment.relatedRecordId}/${attachment.id}-${attachment.fileName}`;
        const bytes = base64ToUint8(attachment.dataBase64);
        const normalized = new Uint8Array(bytes.byteLength);
        normalized.set(bytes);
        const blob = new Blob([normalized.buffer], { type: attachment.mimeType });

        const { error } = await client.storage
          .from('marches-documents')
          .upload(storagePath, blob, {
            contentType: attachment.mimeType,
            upsert: true,
          });
        if (error) return { ok: false, errorMessage: error.message };
        return { ok: true, storagePath };
      } catch (err) {
        return {
          ok: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async pullUpdatedSince(tableName, sinceIso) {
      let query = client.from(tableName).select('*');
      if (sinceIso) {
        query = query.gt('updated_at', sinceIso);
      }
      const { data, error } = await query.order('updated_at', { ascending: true }).limit(500);
      if (error || !data) return [];
      return data as OfflineRecordBase[];
    },
  };
}

export const SYNCABLE_TABLES: OfflineEntityTable[] = [
  'projects',
  'tender_files',
  'bids',
  'sca_evaluations',
  'contracts',
  'decomptes',
  'amendments',
  'indemnity_scales',
  'session_attendances',
  'indemnity_liquidations',
  'disputes',
  'generated_correspondences',
  'audit_logs',
];

export interface BidirectionalSyncReport {
  pushedCount: number;
  uploadedAttachmentsCount: number;
  pulledCount: number;
  conflictsCount: number;
  errors: string[];
  syncedAt: string;
}

export async function bidirectionalSyncWithSupabase(
  db: CommandePubliqueOfflineDB,
  transport: RemoteSyncTransport,
  tablesToPull: OfflineEntityTable[] = SYNCABLE_TABLES
): Promise<BidirectionalSyncReport> {
  const errors: string[] = [];
  let pushedCount = 0;
  let uploadedAttachmentsCount = 0;
  let pulledCount = 0;
  let conflictsCount = 0;

  // 1. Upload des pièces scannées compressées en attente
  const pendingAttachments = await db.scannedAttachments
    .where('uploadStatus')
    .anyOf(['PENDING_UPLOAD', 'FAILED'])
    .toArray();

  for (const att of pendingAttachments) {
    const res = await transport.uploadAttachment(att);
    if (res.ok) {
      await db.scannedAttachments.update(att.id, {
        uploadStatus: 'UPLOADED',
        storagePath: res.storagePath,
      });
      uploadedAttachmentsCount += 1;
    } else {
      await db.scannedAttachments.update(att.id, { uploadStatus: 'FAILED' });
      errors.push(res.errorMessage ?? `Échec upload pièce ${att.fileName}`);
    }
  }

  // 2. Push de la file des mutations locales (FIFO)
  const pendingMutations = await db.mutationQueue
    .where('status')
    .anyOf(['PENDING', 'FAILED'])
    .sortBy('createdAt');

  for (const mut of pendingMutations) {
    if (mut.id === undefined) continue;
    await db.mutationQueue.update(mut.id, { status: 'SYNCING' });

    const pushRes = await transport.pushMutation(mut);
    if (pushRes.ok) {
      if (pushRes.serverRecord) {
        await db.getEntityTable(mut.tableName).put(pushRes.serverRecord);
      }
      await db.mutationQueue.delete(mut.id);
      pushedCount += 1;
    } else if (pushRes.conflict) {
      conflictsCount += 1;
      await db.mutationQueue.update(mut.id, {
        status: 'CONFLICT',
        lastError: pushRes.errorMessage,
        updatedAt: new Date().toISOString(),
      });
      errors.push(pushRes.errorMessage ?? 'Conflit de synchronisation.');
    } else {
      await db.mutationQueue.update(mut.id, {
        status: 'FAILED',
        retryCount: mut.retryCount + 1,
        lastError: pushRes.errorMessage,
        updatedAt: new Date().toISOString(),
      });
      errors.push(pushRes.errorMessage ?? `Échec push ${mut.tableName}/${mut.recordId}`);
    }
  }

  // 3. Pull incrémental depuis Supabase sans écraser les enregistrements ayant une mutation locale PENDING/CONFLICT
  const remainingQueue = await db.mutationQueue.toArray();
  const protectedKeys = new Set(
    remainingQueue.map((q) => `${q.tableName}:${q.recordId}`)
  );

  for (const tableName of tablesToPull) {
    const meta = await db.syncMetadata.get(tableName);
    const remoteRows = await transport.pullUpdatedSince(
      tableName,
      meta?.lastPulledAt ?? null
    );
    if (remoteRows.length > 0) {
      const table = db.getEntityTable(tableName);
      let maxUpdatedAt = meta?.lastPulledAt ?? '';
      for (const row of remoteRows) {
        if (!protectedKeys.has(`${tableName}:${row.id}`)) {
          await table.put(row);
          pulledCount += 1;
        }
        if (row.updated_at && row.updated_at > maxUpdatedAt) {
          maxUpdatedAt = row.updated_at;
        }
      }
      await db.syncMetadata.put({
        tableName,
        lastPulledAt: maxUpdatedAt || new Date().toISOString(),
        lastPushAt: new Date().toISOString(),
      });
    }
  }

  const syncedAt = new Date().toISOString();
  await notifyStatusListeners(db, syncedAt, errors[0] ?? null);

  return {
    pushedCount,
    uploadedAttachmentsCount,
    pulledCount,
    conflictsCount,
    errors,
    syncedAt,
  };
}

// ============================================================================
// INDICATEUR TEMPS REEL D'ETAT RESEAU & SYNCHRONISATION (REACT HOOK)
// ============================================================================

let simulatedOfflineFlag = false;
let lastSyncedTimestamp: string | null = null;
let lastSyncErrorMsg: string | null = null;
let isCurrentlySyncing = false;
const listeners = new Set<(snap: SyncStatusSnapshot) => void>();

export function setSimulatedOfflineMode(offline: boolean): void {
  simulatedOfflineFlag = offline;
  if (typeof window !== 'undefined') {
    void notifyStatusListeners(getOfflineDb());
  }
}

export async function getSyncStatusSnapshot(
  db: CommandePubliqueOfflineDB
): Promise<SyncStatusSnapshot> {
  const browserOnline =
    typeof navigator !== 'undefined' ? navigator.onLine : true;
  const isOnline = browserOnline && !simulatedOfflineFlag;

  const allQueue = await db.mutationQueue.toArray();
  const pendingMutationsCount = allQueue.filter(
    (q) => q.status === 'PENDING' || q.status === 'SYNCING'
  ).length;
  const conflictCount = allQueue.filter((q) => q.status === 'CONFLICT').length;
  const failedCount = allQueue.filter((q) => q.status === 'FAILED').length;

  const pendingAttachmentsCount = await db.scannedAttachments
    .where('uploadStatus')
    .anyOf(['PENDING_UPLOAD', 'FAILED'])
    .count();

  let syncState: SyncState = 'IDLE';
  if (!isOnline) syncState = 'OFFLINE';
  else if (isCurrentlySyncing) syncState = 'SYNCING';
  else if (conflictCount > 0) syncState = 'CONFLICT';
  else if (failedCount > 0 || lastSyncErrorMsg) syncState = 'ERROR';

  return {
    isOnline,
    simulatedOffline: simulatedOfflineFlag,
    syncState,
    pendingMutationsCount,
    pendingAttachmentsCount,
    conflictCount,
    failedCount,
    lastSyncedAt: lastSyncedTimestamp,
    lastError: lastSyncErrorMsg,
  };
}

async function notifyStatusListeners(
  db: CommandePubliqueOfflineDB,
  syncedAt?: string,
  errorMsg?: string | null
): Promise<void> {
  if (syncedAt !== undefined) lastSyncedTimestamp = syncedAt;
  if (errorMsg !== undefined) lastSyncErrorMsg = errorMsg;
  const snap = await getSyncStatusSnapshot(db);
  for (const listener of listeners) {
    listener(snap);
  }
}

export function useOfflineSyncStatus(): SyncStatusSnapshot & {
  triggerSync: () => Promise<BidirectionalSyncReport | null>;
  toggleSimulatedOffline: () => void;
} {
  const [snapshot, setSnapshot] = useState<SyncStatusSnapshot>({
    isOnline: true,
    simulatedOffline: false,
    syncState: 'IDLE',
    pendingMutationsCount: 0,
    pendingAttachmentsCount: 0,
    conflictCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    lastError: null,
  });

  const triggerSync = useCallback(async (): Promise<BidirectionalSyncReport | null> => {
    if (typeof window === 'undefined') return null;
    const db = getOfflineDb();
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!browserOnline || simulatedOfflineFlag) {
      await notifyStatusListeners(db);
      return null;
    }

    const client = createSupabaseBrowserClient();
    if (!client) {
      // Mode autonome local (aucun projet Supabase configuré dans .env)
      const now = new Date().toISOString();
      await notifyStatusListeners(db, now, null);
      return {
        pushedCount: 0,
        uploadedAttachmentsCount: 0,
        pulledCount: 0,
        conflictsCount: 0,
        errors: [],
        syncedAt: now,
      };
    }

    isCurrentlySyncing = true;
    await notifyStatusListeners(db);
    try {
      const transport = createSupabaseSyncTransport(client);
      return await bidirectionalSyncWithSupabase(db, transport);
    } finally {
      isCurrentlySyncing = false;
      await notifyStatusListeners(db);
    }
  }, []);

  const toggleSimulatedOffline = useCallback(() => {
    setSimulatedOfflineMode(!simulatedOfflineFlag);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const db = getOfflineDb();
    const handler = (snap: SyncStatusSnapshot) => setSnapshot(snap);
    listeners.add(handler);
    void notifyStatusListeners(db);

    const onOnline = () => {
      void notifyStatusListeners(db).then(() => triggerSync());
    };
    const onOffline = () => {
      void notifyStatusListeners(db);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      listeners.delete(handler);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [triggerSync]);

  return {
    ...snapshot,
    triggerSync,
    toggleSimulatedOffline,
  };
}
