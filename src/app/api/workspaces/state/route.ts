import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';

export const runtime = 'nodejs';

type WorkspaceKey = 'CPM_SCA' | 'FINANCE_CF' | 'SOUMISSIONNAIRE' | 'CONTENTIEUX';

const ALLOWED_KEYS: WorkspaceKey[] = [
  'CPM_SCA',
  'FINANCE_CF',
  'SOUMISSIONNAIRE',
  'CONTENTIEUX',
];

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authorizeEntityScope(
  admin: NonNullable<ReturnType<typeof getServiceSupabase>>,
  userId: string,
  entityId: string
): Promise<{ allowed: boolean; isSuperAdmin: boolean }> {
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('platform_super_admin')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('entity_memberships')
      .select('role, active, is_active')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .eq('active', true)
      .maybeSingle(),
  ]);

  const isSuperAdmin = Boolean(
    (profile as { platform_super_admin?: boolean } | null)?.platform_super_admin
  );
  if (isSuperAdmin) return { allowed: true, isSuperAdmin: true };

  const m = membership as { active?: boolean; is_active?: boolean } | null;
  return {
    allowed: Boolean(m && m.active !== false && m.is_active !== false),
    isSuperAdmin: false,
  };
}

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const entityId = searchParams.get('entityId')?.trim() ?? '';
  const spaceKey = searchParams.get('spaceKey')?.trim() as WorkspaceKey;

  if (!entityId || !ALLOWED_KEYS.includes(spaceKey)) {
    return Response.json(
      { error: 'entityId et spaceKey valides requis.' },
      { status: 400 }
    );
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  const access = await authorizeEntityScope(admin, guard.userId, entityId);
  if (!access.allowed) {
    return Response.json({ error: 'Accès refusé à cette entité.' }, { status: 403 });
  }

  const { data: stateRow } = await admin
    .from('entity_workspace_states')
    .select('state_json, updated_at')
    .eq('entity_id', entityId)
    .eq('space_key', spaceKey)
    .maybeSingle();

  let openTenders: unknown[] = [];
  if (spaceKey === 'SOUMISSIONNAIRE') {
    const { data: tenderRows } = await admin
      .from('projects')
      .select('id, code, title, nature, mode, estimated_amount_ttc, status, updated_at')
      .eq('entity_id', entityId)
      .order('updated_at', { ascending: false })
      .limit(25);
    openTenders = tenderRows ?? [];
  }

  return Response.json({
    entityId,
    spaceKey,
    state: (stateRow as { state_json?: Record<string, unknown> } | null)?.state_json ?? null,
    updatedAt: (stateRow as { updated_at?: string } | null)?.updated_at ?? null,
    openTenders,
  });
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      entityId?: string;
      spaceKey?: WorkspaceKey;
      state?: Record<string, unknown>;
      actionLabel?: string;
    };

    const entityId = body.entityId?.trim() ?? '';
    const spaceKey = body.spaceKey;
    if (!entityId || !spaceKey || !ALLOWED_KEYS.includes(spaceKey) || !body.state) {
      return Response.json(
        { error: 'entityId, spaceKey et state JSON requis.' },
        { status: 400 }
      );
    }

    const access = await authorizeEntityScope(admin, guard.userId, entityId);
    if (!access.allowed) {
      return Response.json({ error: 'Accès refusé à cette entité.' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const { data: saved, error: upsertErr } = await admin
      .from('entity_workspace_states')
      .upsert(
        {
          entity_id: entityId,
          space_key: spaceKey,
          state_json: body.state,
          updated_by: guard.userId,
          updated_at: nowIso,
        },
        { onConflict: 'entity_id,space_key' }
      )
      .select('entity_id, space_key, updated_at')
      .single();

    if (upsertErr) {
      return Response.json({ error: upsertErr.message }, { status: 400 });
    }

    await admin.from('audit_logs').insert({
      entity_id: entityId,
      actor_user_id: guard.userId,
      actor_role: access.isSuperAdmin ? 'SUPER_ADMIN' : spaceKey,
      action: body.actionLabel ?? `SAVE_WORKSPACE_${spaceKey}`,
      table_name: 'entity_workspace_states',
      record_id: entityId,
      payload: { spaceKey, updatedAt: nowIso },
    });

    return Response.json({
      ok: true,
      saved,
      updatedAt: nowIso,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
