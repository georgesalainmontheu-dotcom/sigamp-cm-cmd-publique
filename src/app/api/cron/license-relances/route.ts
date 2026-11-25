import { createClient } from '@supabase/supabase-js';
import {
  evaluateLicenseAlertAndRelance,
  type EntityLicenseStatus,
  type LicensePlanCode,
} from '../../../../lib/domain/licensingEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized cron invocation.' }, { status: 401 });
  }

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  const { data: rows, error } = await admin
    .from('entity_licenses')
    .select('id, entity_id, plan_code, status, license_key, expires_at, entities(code, name, email, active)')
    .order('expires_at', { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  let expiredUpdated = 0;
  let alertsDetected = 0;
  let emailsSent = 0;

  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RELANCE_FROM_EMAIL ?? 'SIGAMP-CM <no-reply@tit-cs.com>';

  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      entity_id: string;
      plan_code: LicensePlanCode;
      status: EntityLicenseStatus;
      license_key: string;
      expires_at: string;
      entities?: { code?: string; name?: string; email?: string; active?: boolean } | null;
    };

    if (r.entities?.active === false) continue;

    const info = evaluateLicenseAlertAndRelance(
      {
        status: r.status,
        planCode: r.plan_code,
        licenseKey: r.license_key,
        expiresAtIso: r.expires_at,
        entityName: r.entities?.name,
        entityCode: r.entities?.code,
        contactEmail: r.entities?.email,
      },
      now
    );

    if (r.status === 'ACTIVE' && info.daysRemaining < 0) {
      await admin
        .from('entity_licenses')
        .update({ status: 'EXPIREE', updated_at: now.toISOString() })
        .eq('id', r.id);
      expiredUpdated += 1;
    }

    if (info.tier !== 'NONE') {
      alertsDetected += 1;

      // Dispatch email automatique via Resend si configuré + email entité présent
      if (resendKey && r.entities?.email && ['J_30', 'J_15', 'J_7', 'J_1', 'EXPIREE'].includes(info.tier)) {
        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [r.entities.email],
              subject: info.relanceSubject,
              text: info.relanceBody,
            }),
          });
          if (emailRes.ok) emailsSent += 1;
        } catch {
          // Journalisé même si le relais mail externe échoue
        }
      }

      await admin.from('audit_logs').insert({
        entity_id: r.entity_id,
        actor_role: 'SYSTEM_CRON',
        action: `LICENSE_CRON_ALERT_${info.tier}`,
        table_name: 'entity_licenses',
        record_id: r.id,
        payload: {
          tier: info.tier,
          daysRemaining: info.daysRemaining,
          autoAction: info.autoAction,
          checkedAt: now.toISOString(),
        },
      });
    }
  }

  return Response.json({
    ok: true,
    checkedAt: now.toISOString(),
    expiredUpdated,
    alertsDetected,
    emailsSent,
  });
}
