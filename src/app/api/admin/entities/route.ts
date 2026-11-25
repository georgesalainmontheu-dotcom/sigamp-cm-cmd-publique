import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import type { EntityType } from '../../../../types/domain';

export const runtime = 'nodejs';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function isSuperAdminUser(
  admin: ReturnType<typeof getServiceSupabase>,
  userId: string
): Promise<boolean> {
  if (!admin) return false;
  const { data } = await admin
    .from('user_profiles')
    .select('platform_super_admin')
    .eq('id', userId)
    .maybeSingle();
  return Boolean((data as { platform_super_admin?: boolean } | null)?.platform_super_admin);
}

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ entities: [], supervision: [] });

  const superAdmin = await isSuperAdminUser(admin, guard.userId);
  if (!superAdmin) {
    return Response.json(
      { error: 'Vue supervision réservée au Super Admin Plateforme (TIT-CS).' },
      { status: 403 }
    );
  }

  const [{ data: entities }, { data: licenses }, { data: memberships }, { data: projects }] =
    await Promise.all([
      admin.from('entities').select('*').order('name'),
      admin
        .from('entity_licenses')
        .select('entity_id, plan_code, status, expires_at, max_active_logins')
        .order('expires_at', { ascending: false }),
      admin.from('entity_memberships').select('entity_id, active, is_active'),
      admin.from('projects').select('entity_id'),
    ]);

  const supervision = (entities ?? []).map((ent) => {
    const eid = (ent as { id: string }).id;
    const latestLic = (licenses ?? []).find((l) => (l as { entity_id: string }).entity_id === eid);
    const activeLoginsCount = (memberships ?? []).filter(
      (m) =>
        (m as { entity_id: string }).entity_id === eid &&
        (m as { active?: boolean }).active !== false &&
        (m as { is_active?: boolean }).is_active !== false
    ).length;
    const projectsCount = (projects ?? []).filter(
      (p) => (p as { entity_id: string }).entity_id === eid
    ).length;
    return {
      ...ent,
      license: latestLic ?? null,
      activeLoginsCount,
      projectsCount,
    };
  });

  return Response.json({ entities: entities ?? [], supervision });
}

type EntityBody =
  | {
      action: 'CREATE_ENTITY';
      code: string;
      name: string;
      type: EntityType;
      region?: string;
      department?: string;
      municipality: string;
      parentEntityId?: string | null;
      hasOwnCipm?: boolean;
      primaryColor?: string;
      accentColor?: string;
    }
  | {
      action: 'UPDATE_ENTITY';
      entityId: string;
      code: string;
      name: string;
      type: EntityType;
      region?: string;
      department?: string;
      municipality: string;
      parentEntityId?: string | null;
      hasOwnCipm?: boolean;
      active: boolean;
    }
  | {
      action: 'DELETE_ENTITY';
      entityId: string;
    };

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ error: 'Service Role manquant.' }, { status: 500 });

  const superAdmin = await isSuperAdminUser(admin, guard.userId);
  if (!superAdmin) {
    return Response.json(
      { error: 'Seul le Super Admin Plateforme (TIT-CS) peut créer, modifier ou supprimer une entité.' },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as EntityBody;

    if (body.action === 'CREATE_ENTITY') {
      const { data, error } = await admin
        .from('entities')
        .insert({
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          type: body.type,
          region: body.region?.trim() || 'Centre',
          department: body.department?.trim() || null,
          municipality: body.municipality.trim(),
          parent_entity_id: body.parentEntityId || null,
          has_own_cipm: body.hasOwnCipm ?? (body.type !== 'COMMUNE' ? true : true),
          primary_color: body.primaryColor || '#0A1F3D',
          accent_color: body.accentColor || '#D4AF37',
          active: true,
          is_active: true,
        })
        .select('*')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ entity: data });
    }

    if (body.action === 'UPDATE_ENTITY') {
      const { data, error } = await admin
        .from('entities')
        .update({
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          type: body.type,
          region: body.region?.trim() || null,
          department: body.department?.trim() || null,
          municipality: body.municipality.trim(),
          parent_entity_id: body.parentEntityId || null,
          has_own_cipm: body.hasOwnCipm ?? true,
          active: body.active,
          is_active: body.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.entityId)
        .select('*')
        .single();
      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ entity: data });
    }

    if (body.action === 'DELETE_ENTITY') {
      const { count } = await admin
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', body.entityId);
      if ((count ?? 0) > 0) {
        return Response.json(
          {
            error:
              'Suppression bloquée : cette entité contient des marchés/projets. Exécutez d’abord une Remise à Zéro ou désactivez-la.',
          },
          { status: 400 }
        );
      }
      const { error } = await admin.from('entities').delete().eq('id', body.entityId);
      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Action entité inconnue.' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
