import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../lib/security/apiAuthAndRateLimit';
import {
  GED_FOLDER_DEFINITIONS,
  resolveGedFolderForAct,
  type GedFolderCode,
  type GedLifecycleStatus,
} from '../../../lib/domain/gedArchiveEngine';
import { computeSha256Hex } from '../../../lib/offline/offlineStore';

export const runtime = 'nodejs';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ folders: GED_FOLDER_DEFINITIONS, documents: [] });

  const url = new URL(req.url);
  const entityId = url.searchParams.get('entityId');
  const projectId = url.searchParams.get('projectId');
  const folderCode = url.searchParams.get('folderCode');
  const q = (url.searchParams.get('q') ?? '').trim();

  if (!entityId) {
    return Response.json({ error: 'entityId requis.' }, { status: 400 });
  }

  let query = admin
    .from('ged_documents')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (projectId) query = query.eq('project_id', projectId);
  if (folderCode && folderCode !== 'ALL') query = query.eq('folder_code', folderCode);
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,chrono_number.ilike.%${q}%,file_name.ilike.%${q}%,content_text.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({
    folders: GED_FOLDER_DEFINITIONS,
    documents: data ?? [],
  });
}

interface ArchiveGedBody {
  action?: 'ARCHIVE' | 'UPDATE_STATUS' | 'ADD_VERSION';
  entityId: string;
  projectId?: string | null;
  documentId?: string;
  folderCode?: GedFolderCode;
  documentCategory?: string;
  actCode?: string;
  title?: string;
  chronoNumber?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sha256Hash?: string;
  contentText?: string;
  qrVerificationId?: string;
  lifecycleStatus?: GedLifecycleStatus;
  actorRole?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ error: 'Supabase Service Role non configuré.' }, { status: 500 });

  try {
    const body = (await req.json()) as ArchiveGedBody;
    if (!body.entityId) {
      return Response.json({ error: 'entityId obligatoire.' }, { status: 400 });
    }

    if (body.action === 'UPDATE_STATUS' && body.documentId && body.lifecycleStatus) {
      const { data, error } = await admin
        .from('ged_documents')
        .update({
          lifecycle_status: body.lifecycleStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.documentId)
        .eq('entity_id', body.entityId)
        .select('*')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ document: data });
    }

    if (!body.title || !body.fileName) {
      return Response.json({ error: 'title et fileName requis pour archiver.' }, { status: 400 });
    }

    const folderCode =
      body.folderCode ?? resolveGedFolderForAct(body.actCode || body.documentCategory || body.title);
    const computedHash =
      body.sha256Hash ||
      (await computeSha256Hex(`${body.entityId}|${body.title}|${body.contentText ?? ''}|${Date.now()}`));

    const { data: created, error } = await admin
      .from('ged_documents')
      .insert({
        entity_id: body.entityId,
        project_id: body.projectId || null,
        folder_code: folderCode,
        document_category: body.documentCategory || 'ACTE_REGLEMENTAIRE',
        act_code: body.actCode || null,
        title: body.title,
        chrono_number: body.chronoNumber || null,
        file_name: body.fileName,
        mime_type: body.mimeType || 'application/pdf',
        file_size_bytes: body.fileSizeBytes ?? (body.contentText?.length ?? 1024),
        sha256_hash: computedHash,
        version_number: 1,
        lifecycle_status: body.lifecycleStatus ?? 'SIGNE_SCELLE',
        content_text: body.contentText || null,
        qr_verification_id: body.qrVerificationId || null,
        actor_user_id: guard.userId,
        actor_role: body.actorRole || null,
        metadata: body.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 400 });

    await admin.from('ged_document_versions').insert({
      document_id: (created as { id: string }).id,
      version_number: 1,
      sha256_hash: computedHash,
      file_size_bytes: body.fileSizeBytes ?? (body.contentText?.length ?? 1024),
      change_note: 'Archivage initial SIGAMP-CM V3.0',
      created_by: guard.userId,
    });

    await admin.from('audit_logs').insert({
      entity_id: body.entityId,
      actor_user_id: guard.userId,
      actor_role: body.actorRole || 'SIGAMP',
      action: 'GED_DOCUMENT_ARCHIVED',
      table_name: 'ged_documents',
      record_id: (created as { id: string }).id,
      details: { folderCode, fileName: body.fileName, sha256: computedHash },
    });

    return Response.json({ document: created });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
