import { createClient } from '@supabase/supabase-js';
import { PURGE_OPERATIONAL_TABLES_ORDERED } from '../../../../lib/domain/entityResetEngine';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';

export const runtime = 'nodejs';

const DEMO_ENTITY_CODES = ['CM-OU-BAF', 'CM-CE-TEST', 'CM-OU-PREF-HN'];
const SUPER_ADMIN_ENTITY_CODE = 'TIT-CS-ADMIN';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertSuperAdmin(
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
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  const isSuper = await assertSuperAdmin(admin, guard.userId);
  if (!isSuper) {
    return Response.json(
      { error: 'Réservé au Super Admin Plateforme (TIT-CS).' },
      { status: 403 }
    );
  }

  const [{ data: demoEntities }, { data: testProfiles }] = await Promise.all([
    admin
      .from('entities')
      .select('id, code, name, active, is_active')
      .in('code', DEMO_ENTITY_CODES)
      .order('code'),
    admin
      .from('user_profiles')
      .select('id, email, full_name, active, is_test_account')
      .eq('is_test_account', true),
  ]);

  const anyDemoEntityActive = (demoEntities ?? []).some(
    (e) => (e as { active?: boolean; is_active?: boolean }).active !== false && (e as { is_active?: boolean }).is_active !== false
  );
  const anyTestUserActive = (testProfiles ?? []).some(
    (u) => (u as { active?: boolean }).active !== false
  );

  return Response.json({
    demoEnabled: anyDemoEntityActive || anyTestUserActive,
    demoEntities: demoEntities ?? [],
    demoUsersCount: (testProfiles ?? []).length,
    activeDemoUsersCount: (testProfiles ?? []).filter(
      (u) => (u as { active?: boolean }).active !== false
    ).length,
  });
}

interface DemoModeActionBody {
  action: 'DISABLE_DEMO' | 'ENABLE_DEMO' | 'GRAND_RESET_AND_DISABLE_DEMO';
  confirmPhrase?: string;
  reason?: string;
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  const isSuper = await assertSuperAdmin(admin, guard.userId);
  if (!isSuper) {
    return Response.json(
      { error: 'Seul le Super Admin Plateforme (TIT-CS) peut piloter le Grand Reset et le Mode Démo.' },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as DemoModeActionBody;

    if (body.action === 'DISABLE_DEMO' || body.action === 'ENABLE_DEMO') {
      const targetActive = body.action === 'ENABLE_DEMO';

      const [{ data: demoEntities }, { data: testProfiles }] = await Promise.all([
        admin.from('entities').select('id, code').in('code', DEMO_ENTITY_CODES),
        admin.from('user_profiles').select('id').eq('is_test_account', true),
      ]);

      const demoEntityIds = (demoEntities ?? []).map((e) => (e as { id: string }).id);
      const testUserIds = (testProfiles ?? []).map((u) => (u as { id: string }).id);

      if (demoEntityIds.length > 0) {
        await admin
          .from('entities')
          .update({
            active: targetActive,
            is_active: targetActive,
            updated_at: new Date().toISOString(),
          })
          .in('id', demoEntityIds)
          .neq('code', SUPER_ADMIN_ENTITY_CODE);
      }

      if (testUserIds.length > 0) {
        await admin
          .from('user_profiles')
          .update({ active: targetActive, updated_at: new Date().toISOString() })
          .in('id', testUserIds);

        await admin
          .from('entity_memberships')
          .update({ active: targetActive, is_active: targetActive })
          .in('user_id', testUserIds);
      }

      await admin.from('audit_logs').insert({
        entity_id: '11111111-1111-4111-8111-111111111101',
        actor_user_id: guard.userId,
        actor_role: 'SUPER_ADMIN',
        action: targetActive ? 'DEMO_MODE_REACTIVATED' : 'DEMO_MODE_DISABLED',
        table_name: 'entities',
        record_id: '11111111-1111-4111-8111-111111111101',
        payload: {
          demoEntityIds,
          testUserIdsCount: testUserIds.length,
          reversible: true,
        },
      });

      return Response.json({
        ok: true,
        demoEnabled: targetActive,
        affectedEntities: demoEntityIds.length,
        affectedTestAccounts: testUserIds.length,
        message: targetActive
          ? `Mode Démo réactivé : ${demoEntityIds.length} entité(s) et ${testUserIds.length} compte(s) de test restaurés.`
          : `Mode Démo désactivé de façon réversible : ${demoEntityIds.length} entité(s) et ${testUserIds.length} compte(s) masqués.`,
      });
    }

    if (body.action === 'GRAND_RESET_AND_DISABLE_DEMO') {
      if ((body.confirmPhrase ?? '').trim().toUpperCase() !== 'GRAND_RESET_PROD') {
        return Response.json(
          { error: 'Saisissez exactement « GRAND_RESET_PROD » pour confirmer le Grand Reset.' },
          { status: 400 }
        );
      }

      const { data: allEntities } = await admin
        .from('entities')
        .select('id, code');
      const allEntityIds = (allEntities ?? []).map((e) => (e as { id: string }).id);

      let totalDeletedRows = 0;
      for (const eid of allEntityIds) {
        for (const table of PURGE_OPERATIONAL_TABLES_ORDERED) {
          // eslint-disable-next-line no-await-in-loop
          const { data: deletedRows, error: delErr } = await admin
            .from(table)
            .delete()
            .eq('entity_id', eid)
            .select('id');
          if (!delErr && Array.isArray(deletedRows)) {
            totalDeletedRows += deletedRows.length;
          }
        }
      }

      // Désactiver de manière réversible les entités & comptes de démo
      const [{ data: demoEntities }, { data: testProfiles }] = await Promise.all([
        admin.from('entities').select('id').in('code', DEMO_ENTITY_CODES),
        admin.from('user_profiles').select('id').eq('is_test_account', true),
      ]);
      const demoEntityIds = (demoEntities ?? []).map((e) => (e as { id: string }).id);
      const testUserIds = (testProfiles ?? []).map((u) => (u as { id: string }).id);

      if (demoEntityIds.length > 0) {
        await admin
          .from('entities')
          .update({ active: false, is_active: false, updated_at: new Date().toISOString() })
          .in('id', demoEntityIds)
          .neq('code', SUPER_ADMIN_ENTITY_CODE);
      }
      if (testUserIds.length > 0) {
        await admin
          .from('user_profiles')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('id', testUserIds);
        await admin
          .from('entity_memberships')
          .update({ active: false, is_active: false })
          .in('user_id', testUserIds);
      }

      await admin.from('audit_logs').insert({
        entity_id: '11111111-1111-4111-8111-111111111101',
        actor_user_id: guard.userId,
        actor_role: 'SUPER_ADMIN',
        action: 'GRAND_RESET_PRODUCTION',
        table_name: 'entities',
        record_id: '11111111-1111-4111-8111-111111111101',
        payload: {
          totalDeletedRows,
          purgedEntitiesCount: allEntityIds.length,
          disabledDemoEntities: demoEntityIds.length,
          disabledTestAccounts: testUserIds.length,
          reason: body.reason ?? 'Grand Reset Plateforme & Passage en Production',
        },
      });

      return Response.json({
        ok: true,
        demoEnabled: false,
        totalDeletedRows,
        purgedEntitiesCount: allEntityIds.length,
        disabledDemoEntities: demoEntityIds.length,
        disabledTestAccounts: testUserIds.length,
        message: `Grand Reset terminé : ${totalDeletedRows} ligne(s) opérationnelle(s) purgée(s) sur ${allEntityIds.length} entité(s), et ${demoEntityIds.length} entité(s) de démo désactivée(s) de manière réversible.`,
      });
    }

    return Response.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
