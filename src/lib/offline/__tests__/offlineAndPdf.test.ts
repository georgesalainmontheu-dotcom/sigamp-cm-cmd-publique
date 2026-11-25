import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  generateOfficialPdf,
  sanitizeWinAnsiText,
} from '../../pdf/pdfGenerator';
import {
  bidirectionalSyncWithSupabase,
  CommandePubliqueOfflineDB,
  getSyncStatusSnapshot,
  queueScannedAttachment,
  saveOfflineRecord,
  setSimulatedOfflineMode,
  type OfflineRecordBase,
  type RemoteSyncTransport,
} from '../offlineStore';

describe('Jalon 4 — Couche Local-First Dexie & Synchronisation Bidirectionnelle', () => {
  it('enregistre hors-ligne, compresse/hash une pièce scannée et synchronise bidirectionnellement avec gestion de conflits', async () => {
    const db = new CommandePubliqueOfflineDB(`test_db_${Date.now()}`);
    await db.open();

    // 1. Ecriture offline d'un projet
    const saved = await saveOfflineRecord(
      db,
      'projects',
      {
        id: 'proj-local-1',
        entity_id: 'ent-1',
        code: 'BAF-2026-999',
        title: 'Construction forage solaire',
      },
      'INSERT'
    );
    expect(saved.sync_version).toBe(1);

    // 2. Ajout d'une pièce scannée en file d'attente locale
    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const att = await queueScannedAttachment(db, {
      entityId: 'ent-1',
      relatedTable: 'bids',
      relatedRecordId: 'bid-1',
      fileName: 'attestation_non_redevance.pdf',
      mimeType: 'application/pdf',
      bytes: fakePdfBytes,
    });
    expect(att.sha256).toHaveLength(64);
    expect(att.uploadStatus).toBe('PENDING_UPLOAD');

    // 3. Simulation réseau hors-ligne
    setSimulatedOfflineMode(true);
    const offlineSnap = await getSyncStatusSnapshot(db);
    expect(offlineSnap.isOnline).toBe(false);
    expect(offlineSnap.syncState).toBe('OFFLINE');
    expect(offlineSnap.pendingMutationsCount).toBe(1);
    expect(offlineSnap.pendingAttachmentsCount).toBe(1);

    // 4. Retour en ligne & Synchronisation bidirectionnelle
    setSimulatedOfflineMode(false);
    const pushedMutations: string[] = [];
    const uploadedAttachments: string[] = [];

    const transport: RemoteSyncTransport = {
      async pushMutation(mut) {
        pushedMutations.push(`${mut.tableName}:${mut.recordId}`);
        return { ok: true, serverRecord: mut.payload as OfflineRecordBase };
      },
      async uploadAttachment(a) {
        uploadedAttachments.push(a.fileName);
        return { ok: true, storagePath: `ent-1/bids/bid-1/${a.fileName}` };
      },
      async pullUpdatedSince(tableName) {
        if (tableName === 'projects') {
          return [
            {
              id: 'proj-remote-2',
              entity_id: 'ent-1',
              code: 'BAF-2026-REMOTE',
              title: 'Projet distant synchronisé',
              sync_version: 3,
              updated_at: '2026-11-23T10:00:00.000Z',
            },
          ];
        }
        return [];
      },
    };

    const report = await bidirectionalSyncWithSupabase(db, transport, ['projects']);
    expect(report.pushedCount).toBe(1);
    expect(report.uploadedAttachmentsCount).toBe(1);
    expect(report.pulledCount).toBe(1);
    expect(report.conflictsCount).toBe(0);
    expect(pushedMutations).toEqual(['projects:proj-local-1']);
    expect(uploadedAttachments).toEqual(['attestation_non_redevance.pdf']);

    const remotePulled = await db.projects.get('proj-remote-2');
    expect(remotePulled?.code).toBe('BAF-2026-REMOTE');

    // 5. Scénario de conflit sur UPDATE + protection locale lors du Pull
    await saveOfflineRecord(
      db,
      'projects',
      {
        id: 'proj-local-1',
        entity_id: 'ent-1',
        code: 'BAF-2026-999',
        title: 'Titre modifié localement',
        sync_version: 1,
      },
      'UPDATE'
    );

    const conflictTransport: RemoteSyncTransport = {
      async pushMutation() {
        return { ok: false, conflict: true, errorMessage: 'Version conflict' };
      },
      async uploadAttachment() {
        return { ok: true };
      },
      async pullUpdatedSince(tableName) {
        if (tableName === 'projects') {
          return [
            {
              id: 'proj-local-1',
              entity_id: 'ent-1',
              code: 'BAF-2026-999',
              title: 'Titre serveur concurrent (ne doit pas écraser local en conflit)',
              sync_version: 5,
              updated_at: '2026-11-23T12:00:00.000Z',
            },
          ];
        }
        return [];
      },
    };

    const conflictReport = await bidirectionalSyncWithSupabase(db, conflictTransport, ['projects']);
    expect(conflictReport.conflictsCount).toBe(1);

    const localProtected = await db.projects.get('proj-local-1');
    expect(localProtected?.title).toBe('Titre modifié localement');

    const conflictSnap = await getSyncStatusSnapshot(db);
    expect(conflictSnap.syncState).toBe('CONFLICT');
    expect(conflictSnap.conflictCount).toBe(1);

    await db.delete();
  });
});

describe('Jalon 4 — Générateur PDF Officiel, Filigrane, QR Code & Scellé SHA-256', () => {
  it('normalise proprement les caractères français spéciaux (espace insécable étroite, œ, —)', () => {
    const clean = sanitizeWinAnsiText('Net à payer\u202F: 14\u00A0250\u202F000 FCFA — Maître d’Œuvre');
    expect(clean).toBe("Net à payer : 14 250 000 FCFA - Maître d'OEuvre");
  });

  it('génère un PDF A4 valide avec QR Code PNG, filigrane, SHA-256 et payload audit_logs', async () => {
    const res = await generateOfficialPdf({
      documentType: 'DECOMPTE',
      documentNumber: 'DEC-2026-003',
      title: 'DÉCOMPTE PROVISOIRE N° 03 — TRAVAUX DE VOIRIE',
      subtitle: 'Marché n° M-2026-011 — Régime du Réel',
      entityId: '11111111-1111-4111-8111-111111111111',
      entityName: 'Commune de Bafang',
      entityCode: 'CM-OU-BAF',
      city: 'Bafang',
      projectCode: 'BAF-2026-011',
      signatoryTitle: 'Le Contrôleur Financier',
      signatoryName: 'Alphonse Tchoupo',
      actorUserId: '33333333-3333-4333-8333-333333333333',
      actorRole: 'CONTROLEUR_FINANCIER',
      recordTableName: 'decomptes',
      recordId: 'dec-003',
      paragraphs: [
        'Montant brut HT exécuté : 25 000 000 FCFA — TVA 19,25% retenue à la source.',
        'Net à payer au titulaire : 17 083 333 FCFA.',
      ],
      table: {
        title: 'Tableau Récapitulatif',
        columns: [
          { header: 'Désignation', width: 300 },
          { header: 'Montant (FCFA)', width: 190 },
        ],
        rows: [
          ['Brut HT', '25 000 000'],
          ['TVA (19,25%)', '4 812 500'],
          ['Net à payer', '17 083 333'],
        ],
      },
      ampliations: ['Ordonnateur', 'Receveur Municipal', 'Titulaire'],
    });

    // Signature binaire "%PDF-"
    const header = String.fromCharCode(...res.pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
    expect(res.pdfBytes.byteLength).toBeGreaterThan(2000);
    expect(res.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(res.sha256Seal).toMatch(/^[a-f0-9]{64}$/);
    expect(res.auditLogEntry.action).toBe('SEAL');
    expect(res.auditLogEntry.new_data.sha256_seal).toBe(res.sha256Seal);
    expect(res.auditLogEntry.new_data.qr_verification_id).toBe(res.qrVerificationId);
  });
});
