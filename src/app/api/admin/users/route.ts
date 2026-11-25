import { createClient } from '@supabase/supabase-js';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';
import type { RbacRole } from '../../../../types/domain';

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
  if (!admin) return Response.json({ users: [] });

  const url = new URL(req.url);
  const entityId = url.searchParams.get('entityId') ?? undefined;
  const auth = await resolveActorAuth(admin, guard.userId, entityId);
  if (!auth.isEntityAdmin) {
    return Response.json({ error: 'Habilitation administrateur requise.' }, { status: 403 });
  }

  let query = admin
    .from('entity_memberships')
    .select(
      'id, user_id, entity_id, role, active, is_active, appointment_act_ref, commission_id, created_at, entities(id, code, name, type), user_profiles(id, full_name, email, grade_title, matricule, phone, niu, department_service, active, is_test_account, platform_super_admin)'
    )
    .order('created_at', { ascending: false });

  if (entityId && !auth.isSuperAdmin) {
    query = query.eq('entity_id', entityId);
  } else if (entityId) {
    query = query.eq('entity_id', entityId);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({
    isSuperAdmin: auth.isSuperAdmin,
    memberships: data ?? [],
  });
}

type UsersBody =
  | {
      action: 'CREATE_USER';
      entityId: string;
      email: string;
      password: string;
      fullName: string;
      role: RbacRole;
      gradeTitle?: string;
      matricule?: string;
      phone?: string;
      niu?: string;
      departmentService?: string;
      appointmentActRef?: string;
      isTestAccount?: boolean;
    }
  | {
      action: 'UPDATE_USER';
      entityId: string;
      membershipId: string;
      userId: string;
      fullName: string;
      role: RbacRole;
      gradeTitle?: string;
      matricule?: string;
      phone?: string;
      niu?: string;
      departmentService?: string;
      appointmentActRef?: string;
      active: boolean;
    }
  | {
      action: 'RESET_PASSWORD';
      entityId: string;
      userId: string;
      newPassword: string;
    }
  | {
      action: 'DELETE_USER_OR_MEMBERSHIP';
      entityId: string;
      membershipId: string;
      userId: string;
      deleteAuthAccount?: boolean;
    };

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) return Response.json({ error: 'Service Role manquant.' }, { status: 500 });

  try {
    const body = (await req.json()) as UsersBody;
    const auth = await resolveActorAuth(admin, guard.userId, body.entityId);
    if (!auth.isEntityAdmin) {
      return Response.json({ error: 'Habilitation Admin d’Entité ou Super Admin requise.' }, { status: 403 });
    }

    if (body.action === 'CREATE_USER') {
      if (!body.email || !body.password || body.password.length < 8 || !body.fullName) {
        return Response.json(
          { error: 'Email, nom complet et mot de passe (min. 8 caractères) obligatoires.' },
          { status: 400 }
        );
      }
      if ((body.role === 'SUPER_ADMIN') && !auth.isSuperAdmin) {
        return Response.json(
          { error: 'Seul le Super Admin Plateforme peut attribuer le rôle SUPER_ADMIN.' },
          { status: 403 }
        );
      }

      const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
        email: body.email.trim().toLowerCase(),
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.fullName.trim() },
      });

      if (authErr || !createdAuth.user) {
        return Response.json(
          { error: authErr?.message ?? 'Erreur création compte Supabase Auth.' },
          { status: 400 }
        );
      }

      const newUserId = createdAuth.user.id;
      await admin.from('user_profiles').upsert({
        id: newUserId,
        email: body.email.trim().toLowerCase(),
        full_name: body.fullName.trim(),
        grade_title: body.gradeTitle?.trim() || 'Agent habilité SIGAMP-CM',
        matricule: body.matricule?.trim() || null,
        phone: body.phone?.trim() || null,
        niu: body.niu?.trim() || null,
        department_service: body.departmentService?.trim() || null,
        active: true,
        is_test_account: Boolean(body.isTestAccount),
      });

      const { data: membership, error: memErr } = await admin
        .from('entity_memberships')
        .insert({
          user_id: newUserId,
          entity_id: body.entityId,
          role: body.role,
          appointment_act_ref: body.appointmentActRef?.trim() || null,
          active: true,
          is_active: true,
        })
        .select('*')
        .single();

      if (memErr) {
        return Response.json({ error: memErr.message }, { status: 400 });
      }

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'CMS_CREATE_USER',
        table_name: 'user_profiles',
        record_id: newUserId,
        details: { email: body.email, role: body.role, fullName: body.fullName },
      });

      return Response.json({ userId: newUserId, membership });
    }

    if (body.action === 'UPDATE_USER') {
      await admin
        .from('user_profiles')
        .update({
          full_name: body.fullName.trim(),
          grade_title: body.gradeTitle?.trim() || 'Agent habilité SIGAMP-CM',
          matricule: body.matricule?.trim() || null,
          phone: body.phone?.trim() || null,
          niu: body.niu?.trim() || null,
          department_service: body.departmentService?.trim() || null,
          active: body.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.userId);

      const { data: updatedMem, error: memErr } = await admin
        .from('entity_memberships')
        .update({
          role: body.role,
          appointment_act_ref: body.appointmentActRef?.trim() || null,
          active: body.active,
          is_active: body.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.membershipId)
        .eq('entity_id', body.entityId)
        .select('*')
        .single();

      if (memErr) return Response.json({ error: memErr.message }, { status: 400 });

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'CMS_UPDATE_USER',
        table_name: 'entity_memberships',
        record_id: body.membershipId,
        details: { userId: body.userId, role: body.role, active: body.active },
      });

      return Response.json({ membership: updatedMem });
    }

    if (body.action === 'RESET_PASSWORD') {
      if (!body.newPassword || body.newPassword.length < 8) {
        return Response.json({ error: 'Mot de passe >= 8 caractères requis.' }, { status: 400 });
      }
      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        password: body.newPassword,
      });
      if (error) return Response.json({ error: error.message }, { status: 400 });

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'CMS_RESET_PASSWORD',
        table_name: 'user_profiles',
        record_id: body.userId,
        details: { resetBy: guard.userId },
      });

      return Response.json({ ok: true });
    }

    if (body.action === 'DELETE_USER_OR_MEMBERSHIP') {
      if (body.userId === guard.userId) {
        return Response.json(
          { error: 'Auto-suppression interdite pour préserver la gouvernance active.' },
          { status: 400 }
        );
      }

      await admin
        .from('entity_memberships')
        .delete()
        .eq('id', body.membershipId)
        .eq('entity_id', body.entityId);

      if (body.deleteAuthAccount && auth.isSuperAdmin) {
        await admin.auth.admin.deleteUser(body.userId);
      }

      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: auth.isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'CMS_REVOKE_OR_DELETE_USER',
        table_name: 'entity_memberships',
        record_id: body.membershipId,
        details: { userId: body.userId, deleteAuthAccount: Boolean(body.deleteAuthAccount) },
      });

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Action utilisateur inconnue.' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
