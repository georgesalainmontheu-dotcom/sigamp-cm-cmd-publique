import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EntityType, RbacRole } from '../../types/domain';
import type { EntityLicenseStatus } from '../domain/licensingEngine';
import {
  ROLE_PROFILES,
  type ActiveRoleProfile,
  type WorkspaceSpaceId,
} from '../ui/demoProfiles';

let browserClient: SupabaseClient | null = null;

function readPublicEnv(key: string): string | undefined {
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
    return process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (key === 'NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER') {
    return process.env.NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER;
  }
  return undefined;
}

export function isDemoRoleSwitcherEnabled(): boolean {
  return readPublicEnv('NEXT_PUBLIC_ALLOW_DEMO_ROLE_SWITCHER') === 'true';
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = readPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export async function buildAuthenticatedJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return headers;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return headers;
}

export function setAuthSessionCookie(accessToken: string | null): void {
  if (typeof document === 'undefined') return;
  if (!accessToken) {
    document.cookie = 'sigamp-sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }
  document.cookie = `sigamp-sb-access-token=${encodeURIComponent(
    accessToken
  )}; Path=/; Max-Age=86400; SameSite=Lax`;
}

export function setSelectedEntityCookie(entityId: string | null): void {
  if (typeof document === 'undefined') return;
  if (!entityId) {
    document.cookie = 'sigamp-selected-entity=; Path=/; Max-Age=0; SameSite=Lax';
    return;
  }
  document.cookie = `sigamp-selected-entity=${encodeURIComponent(
    entityId
  )}; Path=/; Max-Age=86400; SameSite=Lax`;
}

export function getSelectedEntityCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('sigamp-selected-entity='));
  if (!match) return null;
  return decodeURIComponent(match.split('=')[1] ?? '');
}

export function mapRbacRoleToSpaceId(role: RbacRole): WorkspaceSpaceId {
  switch (role) {
    case 'SIGAMP':
    case 'MO_MOD':
    case 'CHEF_SERVICE_MARCHE':
    case 'INGENIEUR_MARCHE':
    case 'SUPER_ADMIN':
    case 'ADMIN_ENTITE':
      return 'SIGAMP_MO';
    case 'CPM_PRESIDENT':
    case 'CPM_MEMBRE':
    case 'CPM_SECRETAIRE':
    case 'SCA_RAPPORTEUR':
    case 'SCA_MEMBRE':
    case 'CCCM':
    case 'ARMP_OBSERVATEUR':
    case 'ARMP_REGULATEUR':
    case 'TUTELLE_ETAT':
      return 'CPM_SCA_ARMP';
    case 'CONTROLEUR_FINANCIER':
    case 'RECEVEUR_COMPTABLE':
      return 'FINANCE_CF';
    case 'SOUMISSIONNAIRE':
      return 'SOUMISSIONNAIRE';
    default:
      return 'SIGAMP_MO';
  }
}

export interface LoginEntityDirectoryItem {
  id: string;
  code: string;
  name: string;
  type: EntityType;
  municipality: string | null;
  primary_color: string;
  accent_color: string;
  license_status: EntityLicenseStatus;
  license_plan_code: string;
  license_expires_at: string | null;
}

export interface EntityLoginAccessResult {
  allowed: boolean;
  reason: string;
  user_active: boolean;
  membership_active: boolean;
  entity_active: boolean;
  license_status: EntityLicenseStatus;
  license_expires_at: string | null;
  is_super_admin: boolean;
  role_codes: string[];
}

export async function listLoginEntities(
  supabase: SupabaseClient
): Promise<LoginEntityDirectoryItem[]> {
  const { data, error } = await supabase.rpc('list_login_entities');
  if (error || !Array.isArray(data)) {
    return [];
  }
  return data as LoginEntityDirectoryItem[];
}

export async function verifyEntityLoginAccess(
  supabase: SupabaseClient,
  entityId: string
): Promise<EntityLoginAccessResult | null> {
  const { data, error } = await supabase.rpc('verify_entity_login_access', {
    p_entity_id: entityId,
  });
  if (error || !Array.isArray(data) || data.length === 0) {
    return null;
  }
  return data[0] as EntityLoginAccessResult;
}

export interface EntityMembershipRecord {
  user_id: string;
  entity_id: string;
  role: RbacRole;
  commission_id: string | null;
  active: boolean;
  is_active?: boolean;
  entities?: {
    id: string;
    code: string;
    name: string;
    type: EntityType;
    municipality: string | null;
    primary_color?: string;
    accent_color?: string;
  } | null;
}

export async function loadAuthenticatedUserProfiles(
  supabase: SupabaseClient
): Promise<{
  userId: string;
  email: string;
  fullName: string;
  accessToken: string;
  isPlatformSuperAdmin: boolean;
  profiles: ActiveRoleProfile[];
} | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.user) return null;

  const { data: userCheck, error: userErr } = await supabase.auth.getUser(
    session.access_token
  );
  if (userErr || !userCheck.user) return null;

  const user = userCheck.user;

  const [{ data: profileRow }, { data: memberships }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('full_name, grade_title, active, platform_super_admin')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('entity_memberships')
      .select(
        'user_id, entity_id, role, commission_id, active, is_active, entities (id, code, name, type, municipality, primary_color, accent_color)'
      )
      .eq('user_id', user.id)
      .eq('active', true),
  ]);

  const typedProfile = profileRow as {
    full_name?: string;
    grade_title?: string;
    active?: boolean;
    platform_super_admin?: boolean;
  } | null;

  if (typedProfile?.active === false) {
    return null;
  }

  const isPlatformSuperAdmin = Boolean(typedProfile?.platform_super_admin);

  const fullName =
    typedProfile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    'Agent Public';

  const adminTitle = typedProfile?.grade_title ?? 'Agent habilité SIGAMP-CM';

  const selectedEntityId = getSelectedEntityCookie();
  let typedMemberships = ((memberships ?? []) as unknown as EntityMembershipRecord[]).filter(
    (m) => m.active !== false && m.is_active !== false
  );

  if (selectedEntityId) {
    const scoped = typedMemberships.filter((m) => m.entity_id === selectedEntityId);
    if (scoped.length > 0) {
      typedMemberships = scoped;
    } else if (isPlatformSuperAdmin) {
      // Super Admin Plateforme inspectant une autre entité active
      const { data: targetEnt } = await supabase
        .from('entities')
        .select('id, code, name, type, municipality, primary_color, accent_color')
        .eq('id', selectedEntityId)
        .maybeSingle();
      if (targetEnt) {
        typedMemberships = [
          {
            user_id: user.id,
            entity_id: selectedEntityId,
            role: 'SUPER_ADMIN',
            commission_id: null,
            active: true,
            is_active: true,
            entities: targetEnt as EntityMembershipRecord['entities'],
          },
        ];
      }
    }
  }

  const primaryEntityId = typedMemberships[0]?.entity_id ?? selectedEntityId;
  let licenseStatus: EntityLicenseStatus = 'ACTIVE';
  let licensePlanCode = 'ANNUELLE';
  let licenseExpiresAt: string | null = null;

  if (primaryEntityId) {
    const { data: licRow } = await supabase
      .from('entity_licenses')
      .select('status, plan_code, expires_at')
      .eq('entity_id', primaryEntityId)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (licRow) {
      const typedLic = licRow as {
        status: EntityLicenseStatus;
        plan_code: string;
        expires_at: string;
      };
      const isExpiredByDate =
        typedLic.status === 'ACTIVE' &&
        new Date(typedLic.expires_at).getTime() < Date.now();
      licenseStatus = isExpiredByDate ? 'EXPIREE' : typedLic.status;
      licensePlanCode = typedLic.plan_code;
      licenseExpiresAt = typedLic.expires_at;
    }
  }

  const isEntityAdmin =
    isPlatformSuperAdmin ||
    typedMemberships.some((m) =>
      ['SUPER_ADMIN', 'ADMIN_ENTITE', 'SIGAMP', 'MO_MOD'].includes(m.role)
    );

  const profiles: ActiveRoleProfile[] = typedMemberships.map((m) => {
    const spaceId = mapRbacRoleToSpaceId(m.role);
    const template =
      ROLE_PROFILES.find((p) => p.spaceId === spaceId) ?? ROLE_PROFILES[0]!;
    return {
      ...template,
      spaceId,
      roleCode: m.role,
      userId: user.id,
      fullName,
      title: adminTitle,
      entityId: m.entity_id,
      entityCode: m.entities?.code ?? 'ENT-CM',
      entityName: m.entities?.name ?? 'Entité Publique',
      entityType: m.entities?.type ?? 'COMMUNE',
      city: m.entities?.municipality ?? 'Yaoundé',
      fiscalYear: new Date().getFullYear(),
      isPlatformSuperAdmin,
      isEntityAdmin,
      licenseStatus,
      licensePlanCode,
      licenseExpiresAt,
      primaryColor: m.entities?.primary_color ?? '#0A1F3D',
      accentColor: m.entities?.accent_color ?? '#D4AF37',
    };
  });

  // Un utilisateur habilité MO_MOD ou ARMP peut aussi accéder à l'espace Contentieux
  const canAccessDisputes = profiles.some((p) =>
    ['SIGAMP', 'MO_MOD', 'ARMP_REGULATEUR', 'CPM_PRESIDENT', 'ADMIN_ENTITE', 'SUPER_ADMIN'].includes(
      p.roleCode
    )
  );
  if (canAccessDisputes && !profiles.some((p) => p.spaceId === 'CONTENTIEUX')) {
    const primary = profiles[0]!;
    const disputeTemplate = ROLE_PROFILES.find((p) => p.spaceId === 'CONTENTIEUX')!;
    profiles.push({
      ...disputeTemplate,
      userId: primary.userId,
      fullName: primary.fullName,
      title: primary.title,
      roleCode: primary.roleCode,
      entityId: primary.entityId,
      entityCode: primary.entityCode,
      entityName: primary.entityName,
      entityType: primary.entityType,
      city: primary.city,
      fiscalYear: primary.fiscalYear,
      isPlatformSuperAdmin,
      isEntityAdmin,
      licenseStatus,
      licensePlanCode,
      licenseExpiresAt,
      primaryColor: primary.primaryColor,
      accentColor: primary.accentColor,
    });
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName,
    accessToken: session.access_token,
    isPlatformSuperAdmin,
    profiles,
  };
}
