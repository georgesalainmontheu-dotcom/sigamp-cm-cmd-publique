import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import type { EntityType, RbacRole } from '../../../../types/domain';

export const runtime = 'nodejs';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveActorAuth(
  admin: ReturnType<typeof getServiceSupabase>,
  userId: string,
  entityId?: string
) {
  if (!admin) return { isSuperAdmin: false, isEntityAdmin: false };
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('platform_super_admin, active')
      .eq('id', userId)
      .maybeSingle(),
    entityId
      ? admin
          .from('entity_memberships')
          .select('role, active, is_active')
          .eq('user_id', userId)
          .eq('entity_id', entityId)
      : Promise.resolve({ data: [] }),
  ]);

  const isSuperAdmin = Boolean(
    (profile as { platform_super_admin?: boolean } | null)?.platform_super_admin
  );
  const isEntityAdmin =
    isSuperAdmin ||
    (memberships ?? []).some(
      (m) =>
        (m as { active?: boolean }).active !== false &&
        (m as { is_active?: boolean }).is_active !== false &&
        ['SUPER_ADMIN', 'ADMIN_ENTITE', 'SIGAMP', 'MO_MOD'].includes(
          String((m as { role?: string }).role)
        )
    );

  return { isSuperAdmin, isEntityAdmin };
}

export async function GET(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ entities: [], memberships: [] });

  const url = new URL(req.url);
  const entityId = url.searchParams.get('entityId');
  const auth = await resolveActorAuth(admin, guard.userId, entityId ?? undefined);

  const entitiesQuery = auth.isSuperAdmin
    ? admin.from('entities').select('*').order('name')
    : entityId
      ? admin.from('entities').select('*').eq('id', entityId)
      : admin.from('entities').select('*').limit(10);

  const [{ data: entities }, { data: memberships }] = await Promise.all([
    entitiesQuery,
    entityId
      ? admin
          .from('entity_memberships')
          .select(
            'id, user_id, entity_id, role, active, is_active, appointment_act_ref, user_profiles(full_name, email, grade_title, active, is_test_account)'
          )
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return Response.json({
    isSuperAdmin: auth.isSuperAdmin,
    isEntityAdmin: auth.isEntityAdmin,
    entities: entities ?? [],
    memberships: memberships ?? [],
  });
}

type StudioPostBody =
  | {
      action: 'PUBLISH_STUDIO';
      entityId: string;
      name: string;
      municipality: string;
      primaryColor: string;
      accentColor: string;
      logoSvg?: string;
      logoUrl?: string;
      headerTimbreText: string;
      footerLegalText: string;
      studioConfig: unknown;
      studioVersions: unknown;
      localReferentials?: unknown;
    }
  | {
      action: 'TOGGLE_LOGIN';
      entityId: string;
      membershipId: string;
      nextActive: boolean;
    }
  | {
      action: 'UPDATE_MEMBER_ROLE';
      entityId: string;
      membershipId: string;
      role: RbacRole;
    }
  | {
      action: 'PROVISION_ENTITY';
      code: string;
      name: string;
      type: EntityType;
      municipality: string;
      region?: string;
      primaryColor?: string;
      accentColor?: string;
    };

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  try {
    const body = (await req.json()) as StudioPostBody;

    if (body.action === 'PROVISION_ENTITY') {
      const auth = await resolveActorAuth(admin, guard.userId);
      if (!auth.isSuperAdmin) {
        return Response.json(
          { error: 'Seul le Super Admin Plateforme (TIT-CS) peut créer une nouvelle entité.' },
          { status: 403 }
        );
      }

      const { data: created, error } = await admin
        .from('entities')
        .insert({
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          type: body.type,
          municipality: body.municipality.trim(),
          region: body.region?.trim() || 'Centre',
          primary_color: body.primaryColor || '#0A1F3D',
          accent_color: body.accentColor || '#D4AF37',
          active: true,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return Response.json({ entity: created });
    }

    const auth = await resolveActorAuth(admin, guard.userId, body.entityId);
    if (!auth.isEntityAdmin) {
      return Response.json(
        { error: 'Habilitation Admin d’Entité ou Super Admin requise.' },
        { status: 403 }
      );
    }

    if (body.action === 'PUBLISH_STUDIO') {
      const { data: updated, error } = await admin
        .from('entities')
        .update({
          name: body.name,
          municipality: body.municipality,
          primary_color: body.primaryColor,
          accent_color: body.accentColor,
          logo_svg: body.logoSvg ?? null,
          logo_url: body.logoUrl ?? null,
          header_timbre_text: body.headerTimbreText,
          footer_legal_text: body.footerLegalText,
          studio_config: body.studioConfig,
          studio_versions: body.studioVersions,
          ...(body.localReferentials !== undefined
            ? { local_referentials: body.localReferentials }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.entityId)
        .select('*')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 400 });

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'PUBLISH_ENTITY_STUDIO_CONFIG',
        table_name: 'entities',
        record_id: body.entityId,
        details: { primaryColor: body.primaryColor, accentColor: body.accentColor },
      });

      return Response.json({ entity: updated });
    }

    if (body.action === 'TOGGLE_LOGIN') {
      const { data: updated, error } = await admin
        .from('entity_memberships')
        .update({
          active: body.nextActive,
          is_active: body.nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.membershipId)
        .eq('entity_id', body.entityId)
        .select('*')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 400 });

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: body.nextActive ? 'ACTIVATE_ENTITY_LOGIN' : 'DEACTIVATE_ENTITY_LOGIN',
        table_name: 'entity_memberships',
        record_id: body.membershipId,
        details: { nextActive: body.nextActive },
      });

      return Response.json({ membership: updated });
    }

    if (body.action === 'UPDATE_MEMBER_ROLE') {
      const { data: updated, error } = await admin
        .from('entity_memberships')
        .update({
          role: body.role,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.membershipId)
        .eq('entity_id', body.entityId)
        .select('*')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 400 });
      return Response.json({ membership: updated });
    }

    return Response.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
