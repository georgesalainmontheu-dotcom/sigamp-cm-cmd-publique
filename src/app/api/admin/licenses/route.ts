import { createClient } from '@supabase/supabase-js';
import {
  evaluateLicenseAlertAndRelance,
  issueEntityLicense,
  LICENSE_PLANS,
  type EntityLicenseStatus,
  type LicensePlanCode,
} from '../../../../lib/domain/licensingEngine';
import { guardAiApiRequest } from '../../../../lib/security/apiAuthAndRateLimit';

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
  if (!admin) {
    return Response.json({ plans: LICENSE_PLANS, licenses: [], orders: [] });
  }

  const url = new URL(req.url);
  const entityId = url.searchParams.get('entityId');

  const [{ data: plans }, { data: licenses }, { data: orders }] = await Promise.all([
    admin.from('license_plans').select('*').eq('active', true).order('price_fcfa'),
    entityId
      ? admin
          .from('entity_licenses')
          .select('*, entities(code, name, type, email)')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
      : admin
          .from('entity_licenses')
          .select('*, entities(code, name, type, email)')
          .order('created_at', { ascending: false })
          .limit(50),
    entityId
      ? admin
          .from('license_orders')
          .select('*')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
      : admin
          .from('license_orders')
          .select('*, entities(code, name)')
          .order('created_at', { ascending: false })
          .limit(50),
  ]);

  const alerts = (licenses ?? [])
    .map((row) => {
      const r = row as {
        id: string;
        entity_id: string;
        plan_code: LicensePlanCode;
        status: EntityLicenseStatus;
        license_key: string;
        expires_at: string;
        entities?: { code?: string; name?: string; email?: string } | null;
      };
      const evalInfo = evaluateLicenseAlertAndRelance({
        status: r.status,
        planCode: r.plan_code,
        licenseKey: r.license_key,
        expiresAtIso: r.expires_at,
        entityName: r.entities?.name,
        entityCode: r.entities?.code,
        contactEmail: r.entities?.email,
      });
      return {
        licenseId: r.id,
        entityId: r.entity_id,
        entityCode: r.entities?.code ?? '',
        entityName: r.entities?.name ?? '',
        planCode: r.plan_code,
        licenseKey: r.license_key,
        expiresAtIso: r.expires_at,
        ...evalInfo,
      };
    })
    .filter((a) => a.tier !== 'NONE');

  return Response.json({
    plans: plans ?? LICENSE_PLANS,
    licenses: licenses ?? [],
    orders: orders ?? [],
    alerts,
  });
}

interface LicenseActionBody {
  action: 'CREATE_ORDER' | 'ACTIVATE_OR_RENEW' | 'SUSPEND' | 'REACTIVATE' | 'SEND_RELANCE';
  entityId: string;
  planCode?: LicensePlanCode;
  paymentChannel?: 'VIREMENT_TRESOR' | 'BON_COMMANDE_PUBLIC' | 'MTN_MOMO' | 'ORANGE_MONEY';
  paymentRef?: string;
  licenseId?: string;
  orderId?: string;
  autoActivate?: boolean;
  relanceTier?: string;
}

export async function POST(req: Request): Promise<Response> {
  const guard = await guardAiApiRequest(req);
  if (!guard.ok) return guard.response;

  const admin = getServiceSupabase();
  if (!admin) {
    return Response.json({ error: 'Service Role manquant.' }, { status: 500 });
  }

  try {
    const body = (await req.json()) as LicenseActionBody;
    const { data: profile } = await admin
      .from('user_profiles')
      .select('platform_super_admin')
      .eq('id', guard.userId)
      .maybeSingle();

    const isSuperAdmin = Boolean(
      (profile as { platform_super_admin?: boolean } | null)?.platform_super_admin
    );

    if (body.action === 'SEND_RELANCE') {
      await admin.from('audit_logs').insert({
        entity_id: body.entityId,
        actor_user_id: guard.userId,
        actor_role: isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN_ENTITE',
        action: 'LICENSE_RELANCE_DISPATCHED',
        table_name: 'entity_licenses',
        record_id: body.licenseId ?? body.entityId,
        payload: {
          relanceTier: body.relanceTier ?? 'MANUAL_OR_J30',
          dispatchedAt: new Date().toISOString(),
        },
      });
      return Response.json({
        ok: true,
        relanceRecordedAt: new Date().toISOString(),
        message: 'Relance de renouvellement consignée dans le journal d’audit officiel.',
      });
    }

    if (
      (body.action === 'SUSPEND' ||
        body.action === 'REACTIVATE' ||
        body.action === 'ACTIVATE_OR_RENEW' ||
        body.autoActivate) &&
      !isSuperAdmin
    ) {
      return Response.json(
        { error: 'Seul le Super Admin Plateforme (TIT-CS) peut activer, suspendre ou réactiver une licence.' },
        { status: 403 }
      );
    }

    if (body.action === 'SUSPEND' || body.action === 'REACTIVATE') {
      if (!body.licenseId) {
        return Response.json({ error: 'licenseId requis.' }, { status: 400 });
      }
      const nextStatus = body.action === 'SUSPEND' ? 'SUSPENDUE' : 'ACTIVE';
      const { data: updated, error } = await admin
        .from('entity_licenses')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', body.licenseId)
        .select('*')
        .single();
      if (error) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      return Response.json({ license: updated });
    }

    const { data: entity } = await admin
      .from('entities')
      .select('id, code, name')
      .eq('id', body.entityId)
      .maybeSingle();

    if (!entity) {
      return Response.json({ error: 'Entité introuvable.' }, { status: 404 });
    }

    const planCode = body.planCode ?? 'ANNUELLE';
    const issued = await issueEntityLicense({
      entityId: body.entityId,
      entityCode: (entity as { code: string }).code,
      entityName: (entity as { name: string }).name,
      planCode,
      paymentChannel: body.paymentChannel ?? 'VIREMENT_TRESOR',
      paymentRef: body.paymentRef ?? `PAY-${Date.now()}`,
      autoActivate: isSuperAdmin && body.autoActivate !== false,
    });

    const plan = LICENSE_PLANS.find((p) => p.planCode === planCode) ?? LICENSE_PLANS[2]!;

    const { data: orderRow, error: orderErr } = await admin
      .from('license_orders')
      .insert({
        entity_id: body.entityId,
        plan_code: planCode,
        order_ref: issued.orderRef,
        amount_fcfa: plan.priceFcfa,
        duration_days: plan.durationDays,
        status: issued.license.status === 'ACTIVE' ? 'VALIDEE_ACTIVEE' : 'EN_ATTENTE_PAIEMENT',
        payment_channel: body.paymentChannel ?? 'VIREMENT_TRESOR',
        payment_ref: issued.license.paymentRef,
        receipt_sha256: issued.license.receiptSha256,
        requested_by: guard.userId,
        validated_by: issued.license.status === 'ACTIVE' ? guard.userId : null,
        validated_at: issued.license.status === 'ACTIVE' ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (orderErr) {
      return Response.json({ error: orderErr.message }, { status: 400 });
    }

    let licenseRow = null;
    if (issued.license.status === 'ACTIVE') {
      const { data: lic, error: licErr } = await admin
        .from('entity_licenses')
        .insert({
          entity_id: body.entityId,
          plan_code: planCode,
          status: 'ACTIVE',
          license_key: issued.license.licenseKey,
          offline_proof_token: issued.license.offlineProofToken,
          starts_at: issued.license.startsAtIso,
          expires_at: issued.license.expiresAtIso,
          max_active_logins: issued.license.maxActiveLogins,
          amount_fcfa: issued.license.amountFcfa,
          payment_ref: issued.license.paymentRef,
          receipt_sha256: issued.license.receiptSha256,
          issued_by: guard.userId,
        })
        .select('*')
        .single();
      if (licErr) {
        return Response.json({ error: licErr.message }, { status: 400 });
      }
      licenseRow = lic;
    }

    return Response.json({
      order: orderRow,
      license: licenseRow ?? issued.license,
      receiptText: issued.receiptText,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
