import { createClient } from '@supabase/supabase-js';
import {
  PRESERVED_CONFIGURATION_ITEMS,
  PURGE_OPERATIONAL_TABLES_ORDERED,
  validateResetConfirmation,
  type EntityResetSummary,
} from '../../../../lib/domain/entityResetEngine';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';

export const runtime = 'nodejs';

interface ResetRequestBody {
  entityId?: string;
  confirmEntityCode?: string;
  reason?: string;
  deleteTestUsers?: boolean;
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const adminClient = getServiceSupabase();
  if (!adminClient) {
    return Response.json(
      { error: 'Configuration serveur Supabase Service Role manquante.' },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as ResetRequestBody;
    const entityId = body.entityId?.trim() ?? '';
    const confirmEntityCode = body.confirmEntityCode?.trim() ?? '';
    const reason = body.reason?.trim() ?? '';
    const deleteTestUsers = Boolean(body.deleteTestUsers);

    const { data: entityRow, error: entityErr } = await adminClient
      .from('entities')
      .select('id, code, name')
      .eq('id', entityId)
      .maybeSingle();

    if (entityErr || !entityRow) {
      return Response.json({ error: 'Entité cible introuvable.' }, { status: 404 });
    }

    const expectedCode = (entityRow as { code: string }).code;

    // Vérification RBAC : Super Admin Plateforme OU Admin d'Entité habilité sur cette entité
    const [{ data: profileRow }, { data: memberships }] = await Promise.all([
      adminClient
        .from('user_profiles')
        .select('platform_super_admin, active')
        .eq('id', guard.userId)
        .maybeSingle(),
      adminClient
        .from('entity_memberships')
        .select('role, active, is_active')
        .eq('user_id', guard.userId)
        .eq('entity_id', entityId)
        .eq('active', true),
    ]);

    const isSuperAdmin = Boolean(
      (profileRow as { platform_super_admin?: boolean } | null)?.platform_super_admin
    );
    const hasEntityAdminRole = (memberships ?? []).some(
      (m) =>
        (m as { active?: boolean; is_active?: boolean }).active !== false &&
        (m as { is_active?: boolean }).is_active !== false &&
        ['SUPER_ADMIN', 'ADMIN_ENTITE', 'SIGAMP', 'MO_MOD'].includes(
          String((m as { role?: string }).role)
        )
    );

    if (!isSuperAdmin && !hasEntityAdminRole) {
      return Response.json(
        {
          error:
            'Action refusée : seul un Super Admin Plateforme ou un Admin d’Entité habilité peut exécuter une remise à zéro production.',
        },
        { status: 403 }
      );
    }

    const validation = validateResetConfirmation({
      targetEntityId: entityId,
      expectedEntityCode: expectedCode,
      confirmEntityCode,
      reason,
      deleteTestUsers,
    });

    if (!validation.valid) {
      return Response.json(
        { error: validation.errors.join(' ') },
        { status: 400 }
      );
    }

    const purgedTables: Array<{ table: string; deletedCount: number }> = [];
    let totalDeletedRows = 0;

    for (const table of PURGE_OPERATIONAL_TABLES_ORDERED) {
      // eslint-disable-next-line no-await-in-loop
      const { data: deletedRows, error: delErr } = await adminClient
        .from(table)
        .delete()
        .eq('entity_id', entityId)
        .select('id');

      if (delErr) {
        // Certaines tables (ex: bids) n'ont pas forcément entity_id direct selon migration; ignorer proprement si colonne absente
        purgedTables.push({ table, deletedCount: 0 });
        continue;
      }
      const count = Array.isArray(deletedRows) ? deletedRows.length : 0;
      purgedTables.push({ table, deletedCount: count });
      totalDeletedRows += count;
    }

    let deletedTestMembershipsCount = 0;
    if (deleteTestUsers) {
      const { data: testProfiles } = await adminClient
        .from('user_profiles')
        .select('id')
        .eq('is_test_account', true);
      const testIds = (testProfiles ?? []).map((p) => (p as { id: string }).id);
      if (testIds.length > 0) {
        const { data: delMem } = await adminClient
          .from('entity_memberships')
          .delete()
          .eq('entity_id', entityId)
          .in('user_id', testIds)
          .select('id');
        deletedTestMembershipsCount = Array.isArray(delMem) ? delMem.length : 0;
      }
    }

    const auditId = crypto.randomUUID();
    const executedAtIso = new Date().toISOString();

    await adminClient.from('audit_logs').insert({
      id: auditId,
      entity_id: entityId,
      actor_user_id: guard.userId,
      actor_role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
      action: 'RESET_ENTITY_TO_PRODUCTION',
      table_name: 'entities',
      record_id: entityId,
      details: {
        expectedCode,
        reason,
        deleteTestUsers,
        totalDeletedRows,
        deletedTestMembershipsCount,
        purgedTables,
        executedAtIso,
      },
    });

    const summary: EntityResetSummary = {
      entityId,
      entityCode: expectedCode,
      purgedTables,
      totalDeletedRows,
      deletedTestMembershipsCount,
      preservedItems: PRESERVED_CONFIGURATION_ITEMS,
      auditLogId: auditId,
      executedAtIso,
    };

    return Response.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: 'Erreur lors de la remise à zéro production.', details: message },
      { status: 500 }
    );
  }
}
