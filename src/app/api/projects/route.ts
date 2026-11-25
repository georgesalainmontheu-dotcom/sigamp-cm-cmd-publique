import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolveGedFolderForAct } from '../../../lib/domain/gedArchiveEngine';
import { guardAiApiRequest } from '../../../lib/security/apiAuthAndRateLimit';
import type { ProcurementMode, ProcurementNature } from '../../../types/domain';

function computeServerSha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export const runtime = 'nodejs';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function hasEntityAccess(
  admin: ReturnType<typeof getServiceSupabase>,
  userId: string,
  entityId: string
): Promise<{ allowed: boolean; role: string }> {
  if (!admin) return { allowed: false, role: 'VISITOR' };
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('platform_super_admin, active')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('entity_memberships')
      .select('role, active, is_active')
      .eq('user_id', userId)
      .eq('entity_id', entityId),
  ]);

  if ((profile as { platform_super_admin?: boolean } | null)?.platform_super_admin) {
    return { allowed: true, role: 'SUPER_ADMIN' };
  }

  const activeMembership = (memberships ?? []).find(
    (m) =>
      (m as { active?: boolean }).active !== false &&
      (m as { is_active?: boolean }).is_active !== false
  );
  if (activeMembership) {
    return {
      allowed: true,
      role: String((activeMembership as { role?: string }).role ?? 'SIGAMP'),
    };
  }
  return { allowed: false, role: 'NONE' };
}

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Supabase Service Role non configuré.' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get('entityId');
  if (!entityId) {
    return Response.json({ error: 'entityId requis.' }, { status: 400 });
  }

  const access = await hasEntityAccess(admin, guard.userId, entityId);
  if (!access.allowed) {
    return Response.json({ error: 'Accès refusé à cette entité.' }, { status: 403 });
  }

  const [{ data: projects, error }, { data: budgetLines }] = await Promise.all([
    admin
      .from('projects')
      .select('*')
      .eq('entity_id', entityId)
      .order('updated_at', { ascending: false }),
    admin
      .from('budget_lines')
      .select('id, fiscal_year, budget_source, chapitre, article, paragraphe, label')
      .eq('entity_id', entityId)
      .order('fiscal_year', { ascending: false }),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({
    projects: projects ?? [],
    budgetLines: budgetLines ?? [],
  });
}

interface UpsertProjectPayload {
  entityId: string;
  projectId?: string;
  referenceCode: string;
  title: string;
  nature?: ProcurementNature;
  mode?: ProcurementMode;
  fiscalYear?: number;
  estimatedAmountTtc?: number;
  currentStage?: number;
  fundingSource?: string;
  maturationValidated?: boolean;
  maturationDocs?: unknown[];
  workflowState?: Record<string, unknown>;
  status?: string;
  archiveDeliverableInGed?: {
    deliverableCode: string;
    deliverableTitle: string;
    chronoNumber?: string;
    responsibleRole?: string;
  };
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Supabase Service Role non configuré.' }, { status: 500 });
  }

  try {
    const body = (await req.json()) as UpsertProjectPayload;
    if (!body.entityId || !body.referenceCode?.trim() || !body.title?.trim()) {
      return Response.json(
        { error: 'entityId, referenceCode et title sont obligatoires.' },
        { status: 400 }
      );
    }

    const access = await hasEntityAccess(admin, guard.userId, body.entityId);
    if (!access.allowed) {
      return Response.json({ error: 'Accès refusé à cette entité.' }, { status: 403 });
    }

    // Résoudre ou créer une ligne budgétaire par défaut pour cette entité
    const { data: existingBl } = await admin
      .from('budget_lines')
      .select('id')
      .eq('entity_id', body.entityId)
      .limit(1)
      .maybeSingle();

    let budgetLineId = existingBl?.id as string | undefined;
    if (!budgetLineId) {
      const { data: createdBl, error: blErr } = await admin
        .from('budget_lines')
        .insert({
          entity_id: body.entityId,
          fiscal_year: body.fiscalYear ?? 2026,
          budget_source: body.fundingSource ?? 'BUDGET_PROPRE',
          chapitre: '22',
          article: '2210',
          paragraphe: '22',
          label: 'Dotation Investissement & Equipement',
          initial_allocation_fcfa: 500_000_000,
        })
        .select('id')
        .single();
      if (blErr || !createdBl) {
        return Response.json(
          { error: blErr?.message ?? 'Impossible de créer la ligne budgétaire.' },
          { status: 400 }
        );
      }
      budgetLineId = createdBl.id;
    }

    const ttc = Math.max(100_000, Number(body.estimatedAmountTtc ?? 48_500_000));
    const ht = Math.round(ttc / 1.1925);

    const payload = {
      entity_id: body.entityId,
      budget_line_id: budgetLineId,
      fiscal_year: body.fiscalYear ?? 2026,
      reference_code: body.referenceCode.trim().toUpperCase(),
      title: body.title.trim(),
      nature: body.nature ?? 'TRAVAUX',
      mode: body.mode ?? 'AONO',
      estimated_amount_ht: ht,
      estimated_amount_ttc: ttc,
      funding_source: body.fundingSource ?? 'BUDGET_PROPRE',
      current_stage: body.currentStage ?? 1,
      maturation_docs: body.maturationDocs ?? [],
      workflow_state: body.workflowState ?? {},
      has_apd_studies: Boolean(body.maturationValidated),
      has_tdr: Boolean(body.maturationValidated),
      has_dqe_mercuriale: Boolean(body.maturationValidated),
      has_land_availability: Boolean(body.maturationValidated),
      maturation_validated_at: body.maturationValidated ? new Date().toISOString() : null,
      maturation_validated_by: body.maturationValidated ? guard.userId : null,
      created_by: guard.userId,
      updated_at: new Date().toISOString(),
    };

    const { data: project, error } = await admin
      .from('projects')
      .upsert(payload, { onConflict: 'entity_id,reference_code' })
      .select('*')
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    await admin.from('audit_logs').insert({
      entity_id: body.entityId,
      actor_user_id: guard.userId,
      actor_role: access.role,
      action: 'PROJECT_UPSERTED',
      table_name: 'projects',
      record_id: project.id,
      payload: {
        referenceCode: project.reference_code,
        currentStage: project.current_stage,
      },
    });

    return Response.json({ project });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Supabase Service Role non configuré.' }, { status: 500 });
  }

  try {
    const body = (await req.json()) as UpsertProjectPayload;
    if (!body.entityId || (!body.projectId && !body.referenceCode)) {
      return Response.json(
        { error: 'entityId et projectId ou referenceCode requis.' },
        { status: 400 }
      );
    }

    const access = await hasEntityAccess(admin, guard.userId, body.entityId);
    if (!access.allowed) {
      return Response.json({ error: 'Accès refusé à cette entité.' }, { status: 403 });
    }

    // Rechercher le projet cible
    let query = admin
      .from('projects')
      .select('*')
      .eq('entity_id', body.entityId);

    if (body.projectId) {
      query = query.eq('id', body.projectId);
    } else if (body.referenceCode) {
      query = query.eq('reference_code', body.referenceCode.trim().toUpperCase());
    }

    const { data: existing } = await query.maybeSingle();

    // Si le projet n'existe pas encore en base pour ce code, on le crée proprement via upsert
    if (!existing) {
      return POST(
        new Request(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(body),
        })
      );
    }

    const ttc =
      typeof body.estimatedAmountTtc === 'number' && body.estimatedAmountTtc > 0
        ? body.estimatedAmountTtc
        : Number(existing.estimated_amount_ttc);
    const ht = Math.round(ttc / 1.1925);

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      sync_version: Number(existing.sync_version ?? 1) + 1,
    };

    if (body.title) patch.title = body.title.trim();
    if (body.nature) patch.nature = body.nature;
    if (body.mode) patch.mode = body.mode;
    if (typeof body.estimatedAmountTtc === 'number') {
      patch.estimated_amount_ttc = ttc;
      patch.estimated_amount_ht = ht;
    }
    if (typeof body.currentStage === 'number') patch.current_stage = body.currentStage;
    if (body.fundingSource) patch.funding_source = body.fundingSource;
    if (Array.isArray(body.maturationDocs)) patch.maturation_docs = body.maturationDocs;
    if (body.workflowState) {
      patch.workflow_state = {
        ...((existing.workflow_state as Record<string, unknown> | null) ?? {}),
        ...body.workflowState,
      };
    }
    if (body.maturationValidated) {
      patch.has_apd_studies = true;
      patch.has_tdr = true;
      patch.has_dqe_mercuriale = true;
      patch.has_land_availability = true;
      patch.maturation_validated_at = new Date().toISOString();
      patch.maturation_validated_by = guard.userId;
    }
    if (body.status) patch.status = body.status;

    const { data: updated, error } = await admin
      .from('projects')
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // Archivage automatique GED si un livrable vient d'être passé à SIGNE_ARCHIVE_GED
    let gedArchivedDocument: Record<string, unknown> | null = null;
    if (body.archiveDeliverableInGed) {
      const deliv = body.archiveDeliverableInGed;
      const folderCode = resolveGedFolderForAct(deliv.deliverableCode);
      const contentText = `LIVRABLE VALIDE & ARCHIVE GED\nProjet : ${updated.reference_code} — ${updated.title}\nCode Livrable : ${deliv.deliverableCode}\nIntitulé : ${deliv.deliverableTitle}\nRéférence Chrono : ${deliv.chronoNumber ?? 'N/A'}\nResponsable : ${deliv.responsibleRole ?? access.role}\nHorodatage : ${new Date().toISOString()}`;
      const sha256 = computeServerSha256Hex(
        `${body.entityId}|${updated.id}|${deliv.deliverableCode}|${deliv.chronoNumber ?? ''}|${Date.now()}`
      );
      const qrId = `SIGAMP-${sha256.slice(0, 12).toUpperCase()}`;

      const { data: gedDoc } = await admin
        .from('ged_documents')
        .insert({
          entity_id: body.entityId,
          project_id: updated.id,
          folder_code: folderCode,
          document_category: 'LIVRABLE_PROCEDURE',
          act_code: deliv.deliverableCode,
          title: `${updated.reference_code} — ${deliv.deliverableTitle}`,
          chrono_number: deliv.chronoNumber || updated.reference_code,
          file_name: `${deliv.deliverableCode}_${updated.reference_code}.txt`,
          mime_type: 'text/plain',
          file_size_bytes: Buffer.byteLength(contentText, 'utf-8'),
          sha256_hash: sha256,
          version_number: 1,
          lifecycle_status: 'SIGNE_SCELLE',
          content_text: contentText,
          qr_verification_id: qrId,
          created_by: guard.userId,
          signed_by: guard.userId,
          signed_at: new Date().toISOString(),
          actor_role: access.role,
          metadata: {
            source: 'MATURATION_ORCHESTRATOR',
            deliverableCode: deliv.deliverableCode,
          },
        })
        .select('*')
        .maybeSingle();

      if (gedDoc) gedArchivedDocument = gedDoc;
    }

    await admin.from('audit_logs').insert({
      entity_id: body.entityId,
      actor_user_id: guard.userId,
      actor_role: access.role,
      action: body.archiveDeliverableInGed
        ? 'DELIVERABLE_ARCHIVED_GED'
        : 'PROJECT_WORKFLOW_UPDATED',
      table_name: 'projects',
      record_id: updated.id,
      payload: {
        referenceCode: updated.reference_code,
        currentStage: updated.current_stage,
        deliverable: body.archiveDeliverableInGed?.deliverableCode ?? null,
      },
    });

    return Response.json({ project: updated, gedArchivedDocument });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
